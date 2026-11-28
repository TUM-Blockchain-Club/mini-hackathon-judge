import { teamNameInput } from './registration';
import {
  officialRubric,
  officialVersion,
  officialPoints,
} from '../judge/official';
import { trackGuide } from '../judge/guide';
import { standings, type TieDecision } from './standings';
import type { SubmissionReceipt, TeamRow } from './types';
import { db, InputError } from './db';
import { teamHash, newTeamCode } from './auth';
import { focuses, ownTopicLimit } from './event';
import { type capture } from './artifacts';
import { rubricSchema, type Rubric } from '../judge/rubric';

export async function publicEvent() {
  try {
    const [e] =
      await db()`SELECT deadline, deadline + interval '10 minutes' AS closes, started_at, clock_timestamp() AS stamp FROM event_settings WHERE singleton`;
    return {
      deadline: e.deadline?.toISOString() as string | undefined,
      closes: e.closes?.toISOString() as string | undefined,
      state: !e.deadline
        ? 'pending'
        : e.started_at || e.closes < e.stamp
          ? 'closed'
          : e.stamp > e.deadline
            ? 'late'
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
  ownTopicInput?: FormDataEntryValue | null,
): Promise<SubmissionReceipt> {
  if (!title.trim() || title.length > 100 || !Object.hasOwn(focuses, focus))
    throw new InputError('Enter a project title and select your focus.');
  let ownTopic: string | null = null;
  if (focus.endsWith('-own')) {
    ownTopic = typeof ownTopicInput === 'string' ? ownTopicInput.trim() : '';
    if (!ownTopic || ownTopic.length > ownTopicLimit || ownTopic.includes('\0'))
      throw new InputError(
        `Describe your team’s focus in up to ${ownTopicLimit} characters.`,
      );
  }
  return db().begin(async (tx) => {
    const [e] =
      await tx`SELECT deadline,started_at FROM event_settings WHERE singleton FOR SHARE`;
    if (!e.deadline || e.started_at)
      throw new InputError('Submissions are closed.', 409);
    const [s] =
      await tx`WITH stamp AS MATERIALIZED (SELECT clock_timestamp() AS accepted_at)
      INSERT INTO submissions(team_id,title,focus,own_topic,source,filename,content,digest,submitted_at,late)
      SELECT ${team},${title.trim()},${focus},${ownTopic},${data.source},${data.filename},${data.bytes},${data.hash},accepted_at,accepted_at > ${e.deadline} FROM stamp
      WHERE accepted_at <= ${e.deadline}::timestamptz + interval '10 minutes' RETURNING id,submitted_at,digest,late`;
    if (!s) throw new InputError('The deadline has passed.', 409);
    return {
      id: s.id,
      date: s.submitted_at.toISOString(),
      digest: s.digest,
      late: s.late,
      title: title.trim(),
      focus,
      ownTopic,
    };
  });
}
export async function latestReceipt(
  teamId: string,
): Promise<SubmissionReceipt | null> {
  const [row] =
    await db()`SELECT id, submitted_at, digest, late, title, focus, own_topic
    FROM submissions WHERE team_id=${teamId} ORDER BY submitted_at DESC, id DESC LIMIT 1`;
  return row
    ? {
        id: row.id,
        date: row.submitted_at.toISOString(),
        digest: row.digest,
        late: row.late,
        title: row.title,
        focus: row.focus,
        ownTopic: row.own_topic,
      }
    : null;
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
      await tx`SELECT id FROM submissions WHERE submitted_at > ${date}::timestamptz + interval '10 minutes' LIMIT 1`;
    if (later.length)
      throw new InputError(
        'The final cutoff would exclude an accepted receipt.',
        409,
      );
    if (
      (
        await tx`SELECT 1 FROM submissions WHERE late IS DISTINCT FROM (submitted_at > ${date}) LIMIT 1`
      ).length
    )
      throw new InputError(
        'This deadline would change the penalty on an accepted receipt.',
        409,
      );
    await tx`UPDATE event_settings SET deadline=${date},rubric=${tx.json(parsed.data)} WHERE singleton`;
  });
}
export async function addTeam(name: string) {
  const parsed = teamNameInput.safeParse(name);
  if (!parsed.success) throw new InputError(parsed.error.issues[0].message);
  const code = newTeamCode();
  const rows = await db().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(lower(${parsed.data})))`;
    return tx`INSERT INTO teams(name,code_hash)
      SELECT ${parsed.data},${teamHash(code)} FROM event_settings
      WHERE singleton AND started_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM teams WHERE lower(name)=lower(${parsed.data}))
      ON CONFLICT(name) DO NOTHING RETURNING id`;
  });
  if (!rows.length)
    throw new InputError(
      'Team name already exists or judging has started.',
      409,
    );
  return code;
}
export async function freezeBatch(
  officialOnly = false,
  target?: { model: string; snapshot: string; approvedGuide?: string },
) {
  return db().begin(async (tx) => {
    const [e] =
      await tx`SELECT *, clock_timestamp() AS stamp FROM event_settings WHERE singleton FOR UPDATE`;
    const model = target?.model ?? process.env.JUDGE_MODEL;
    const snapshot = target?.snapshot ?? process.env.JUDGE_SNAPSHOT_ID;
    if (target && e.started_at && e.snapshot !== snapshot)
      throw new InputError(
        'The frozen batch requires its original Cloud Run image.',
        409,
      );
    if (!e.started_at) {
      if (!e.deadline || +e.stamp <= +e.deadline + 600_000)
        throw new InputError(
          'Judging opens after the late submission window.',
          409,
        );
      if (!model || !snapshot || !process.env.GEMINI_API_KEY?.trim())
        throw new InputError(
          'Configure the OpenAI project key in GEMINI_API_KEY and the sandbox before starting.',
          503,
        );
      if (!e.guide && target?.approvedGuide) {
        e.guide = target.approvedGuide;
        e.rubric = officialRubric;
        await tx`UPDATE event_settings SET guide=${target.approvedGuide},rubric=${tx.json(officialRubric)} WHERE singleton`;
      }
      const rubric = e.rubric ? rubricSchema.parse(e.rubric) : officialRubric;
      const official = rubric.version === officialVersion;
      if (officialOnly && !official)
        throw new InputError(
          'Import the approved guide before starting official judging.',
          409,
        );
      if (official && !e.guide)
        throw new InputError(
          'Import the confidential judging guide before starting.',
          409,
        );
      const subs =
        await tx`SELECT DISTINCT ON(team_id) id,focus FROM submissions WHERE submitted_at <= ${e.deadline}::timestamptz + interval '10 minutes' ORDER BY team_id,submitted_at DESC,id DESC`;
      if (!subs.length)
        throw new InputError('No submissions are available to judge.', 409);
      for (const s of subs) {
        const rules = official
          ? officialRubric.common
          : [...rubric.common, ...(rubric.focuses[s.focus] ?? [])];
        const guide = official ? trackGuide(e.guide, s.focus) : undefined;
        await tx`INSERT INTO judge_runs(submission_id,until_at,rubric,model,snapshot) VALUES(${s.id},${new Date(+e.stamp + 900_000)},${tx.json({ version: rubric.version, criteria: rules, ...(guide ? { guide } : {}) })},${model!},${snapshot!})`;
      }
      await tx`UPDATE event_settings SET started_at=${e.stamp},model=${model!},snapshot=${snapshot!} WHERE singleton`;
    }
    const jobs =
      await tx`SELECT id FROM judge_runs WHERE worker IS NULL AND phase='queued' AND until_at>clock_timestamp()`;
    return jobs.map((j) => String(j.id));
  });
}
export async function desk(adminId: string | null = null) {
  const sql = db();
  await sql`UPDATE judge_runs SET phase='review',issue='The 15-minute deadline elapsed before a valid scorecard was saved.' WHERE until_at<=clock_timestamp() AND phase NOT IN ('complete','review')`;
  const [[event], teams, decisions] = await Promise.all([
    sql`SELECT deadline,started_at,rubric,guide IS NOT NULL AS guide_ready FROM event_settings WHERE singleton`,
    sql<
      TeamRow[]
    >`SELECT t.id,t.name,t.pitch AS legacy_pitch,b.ballots,b.pitch_sum,b.pitch_means,b.my_ballot,
      s.id AS submission,s.title,s.focus,s.own_topic,s.digest,s.source,s.filename,s.submitted_at::text,s.late,
      j.id AS run_id,j.phase,j.points,j.issue,j.rubric->'guide'->>'revision' AS guide_revision,j.rubric-'guide' AS rubric,j.scorecard,j.jury_review,coalesce((SELECT jsonb_agg(d.decision ORDER BY d.id) FROM jury_decisions d WHERE d.run_id=j.id),'[]'::jsonb) AS history
      FROM teams t LEFT JOIN LATERAL (SELECT * FROM submissions WHERE team_id=t.id ORDER BY submitted_at DESC,id DESC LIMIT 1) s ON true
      LEFT JOIN judge_runs j ON j.submission_id=s.id
      CROSS JOIN LATERAL (SELECT count(*)::int AS ballots,coalesce(sum(p1+p2+p3+p4),0)::int AS pitch_sum,
       CASE WHEN count(*)=3 THEN jsonb_build_object('p1',avg(p1),'p2',avg(p2),'p3',avg(p3),'p4',avg(p4)) END AS pitch_means,
       (jsonb_agg(to_jsonb(v)-'admin_id'-'team_id') FILTER (WHERE admin_id=${adminId}::uuid))->0 AS my_ballot
       FROM pitch_ballots v WHERE v.team_id=t.id) b`,
    sql<TieDecision[]>`SELECT * FROM podium_decisions`,
  ]);
  for (const t of teams) {
    if (t.jury_review && t.scorecard && 'efficiencyApplicable' in t.scorecard) {
      const rows = t.scorecard.rows.map((r) =>
        r.id === 'S1' ? { ...r, points: t.jury_review!.correctness } : r,
      );
      t.points = officialPoints({ rows }, t.scorecard.efficiencyApplicable);
    }
  }
  return {
    deadline: event.deadline?.toISOString() as string | undefined,
    started: !!event.started_at,
    guideReady: !!event.guide_ready,
    rubric: (event.rubric ?? officialRubric) as Rubric,
    teams: standings(teams, decisions),
  };
}
