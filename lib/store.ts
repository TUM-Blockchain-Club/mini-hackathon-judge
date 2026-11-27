import type { TeamRow } from './types';
import { db, InputError } from './db';
import { teamHash, newTeamCode } from './auth';
import { focuses } from './event';
import { type capture } from './artifacts';
import { rubricSchema, type Rubric } from '../judge/rubric';

export async function publicEvent() {
  try {
    const [e] =
      await db()`SELECT deadline, started_at FROM event_settings WHERE singleton`;
    return {
      deadline: e.deadline?.toISOString() as string | undefined,
      state: !e.deadline
        ? 'pending'
        : e.started_at || e.deadline <= new Date()
          ? 'closed'
          : 'open',
    } as const;
  } catch {
    return { deadline: undefined, state: 'unavailable' } as const;
  }
}
export async function requireTeam(code: string) {
  const [t] =
    await db()`SELECT id,name FROM teams WHERE code_hash=${teamHash(code)}`;
  if (!t) throw new InputError('Check your team access code.', 403);
  return { id: t.id as string, name: t.name as string };
}
export async function saveSubmission(
  team: string,
  title: string,
  focus: string,
  data: Awaited<ReturnType<typeof capture>>,
) {
  if (!title.trim() || title.length > 100 || !Object.hasOwn(focuses, focus))
    throw new InputError('Enter a project title and select your focus.');
  return db().begin(async (tx) => {
    const [e] =
      await tx`SELECT deadline,started_at FROM event_settings WHERE singleton FOR SHARE`;
    if (!e.deadline || e.started_at)
      throw new InputError('Submissions are closed.', 409);
    const [s] =
      await tx`WITH stamp AS MATERIALIZED (SELECT clock_timestamp() AS accepted_at)
      INSERT INTO submissions(team_id,title,focus,source,filename,content,digest,submitted_at)
      SELECT ${team},${title.trim()},${focus},${data.source},${data.filename},${data.bytes},${data.hash},accepted_at FROM stamp
      WHERE accepted_at < ${e.deadline} RETURNING id,submitted_at,digest`;
    if (!s) throw new InputError('The deadline has passed.', 409);
    return { id: s.id, date: s.submitted_at.toISOString(), digest: s.digest };
  });
}
export async function configure(deadline: string, raw: unknown) {
  const date = new Date(deadline);
  if (!Number.isFinite(+date))
    throw new InputError('Choose a valid submission deadline.');
  const parsed = rubricSchema.safeParse(raw);
  if (!parsed.success) throw new InputError(parsed.error.issues[0].message);
  await db().begin(async (tx) => {
    const [event] =
      await tx`SELECT started_at FROM event_settings WHERE singleton FOR UPDATE`;
    if (event.started_at)
      throw new InputError('Settings are locked for this batch.', 409);
    const later =
      await tx`SELECT id FROM submissions WHERE submitted_at>=${date} LIMIT 1`;
    if (later.length)
      throw new InputError(
        'Choose a deadline after the latest accepted receipt.',
        409,
      );
    await tx`UPDATE event_settings SET deadline=${date},rubric=${tx.json(parsed.data)} WHERE singleton`;
  });
}
export async function addTeam(name: string) {
  if (!name.trim() || name.trim().length > 80)
    throw new InputError('Enter a team name of up to 80 characters.');
  const code = newTeamCode();
  const rows =
    await db()`INSERT INTO teams(name,code_hash) SELECT ${name.trim()},${teamHash(code)} FROM event_settings WHERE singleton AND started_at IS NULL ON CONFLICT(name) DO NOTHING RETURNING id`;
  if (!rows.length)
    throw new InputError(
      'Team name already exists or judging has started.',
      409,
    );
  return code;
}
export async function freezeBatch() {
  return db().begin(async (tx) => {
    const [e] =
      await tx`SELECT *, clock_timestamp() AS stamp FROM event_settings WHERE singleton FOR UPDATE`;
    if (!e.started_at) {
      if (!e.deadline || e.stamp < e.deadline)
        throw new InputError(
          'Judging opens after the submission deadline.',
          409,
        );
      if (
        !process.env.JUDGE_MODEL ||
        !process.env.JUDGE_SNAPSHOT_ID ||
        (!process.env.VERCEL &&
          !process.env.AI_GATEWAY_API_KEY &&
          !process.env.VERCEL_OIDC_TOKEN)
      )
        throw new InputError(
          'Configure the judge model, gateway access and sandbox snapshot before starting.',
          503,
        );
      const rubric = rubricSchema.parse(e.rubric);
      const subs =
        await tx`SELECT DISTINCT ON(team_id) id,focus FROM submissions WHERE submitted_at<${e.deadline} ORDER BY team_id,submitted_at DESC,id DESC`;
      if (!subs.length)
        throw new InputError('No submissions are available to judge.', 409);
      for (const s of subs) {
        const rules = [...rubric.common, ...rubric.focuses[s.focus]];
        await tx`INSERT INTO judge_runs(submission_id,until_at,rubric,model,snapshot) VALUES(${s.id},${new Date(+e.stamp + 900_000)},${tx.json({ version: rubric.version, criteria: rules })},${process.env.JUDGE_MODEL},${process.env.JUDGE_SNAPSHOT_ID})`;
      }
      await tx`UPDATE event_settings SET started_at=${e.stamp},model=${process.env.JUDGE_MODEL},snapshot=${process.env.JUDGE_SNAPSHOT_ID} WHERE singleton`;
    }
    const jobs =
      await tx`SELECT id FROM judge_runs WHERE worker IS NULL AND phase='queued' AND until_at>clock_timestamp()`;
    return jobs.map((j) => String(j.id));
  });
}
export async function desk() {
  const sql = db();
  await sql`UPDATE judge_runs SET phase='review',issue='The 15-minute deadline elapsed before a valid scorecard was saved.' WHERE until_at<=clock_timestamp() AND phase NOT IN ('complete','review')`;
  const [events, teams] = await Promise.all([
    sql`SELECT * FROM event_settings WHERE singleton`,
    sql<
      TeamRow[]
    >`SELECT t.id,t.name,t.pitch,s.id AS submission,s.title,s.focus,s.digest,s.filename,s.submitted_at::text,
    j.id AS run_id,j.phase,j.points,j.issue,j.rubric,j.scorecard FROM teams t
    LEFT JOIN LATERAL (SELECT id,title,focus,digest,filename,submitted_at FROM submissions WHERE team_id=t.id ORDER BY submitted_at DESC,id DESC LIMIT 1) s ON true
    LEFT JOIN judge_runs j ON j.submission_id=s.id ORDER BY (j.points+t.pitch) DESC NULLS LAST,j.points DESC NULLS LAST,t.name`,
  ]);
  const e = events[0];
  return {
    deadline: e.deadline?.toISOString() as string | undefined,
    started: !!e.started_at,
    rubric: e.rubric as Rubric | null,
    teams: Array.from(teams),
  };
}
