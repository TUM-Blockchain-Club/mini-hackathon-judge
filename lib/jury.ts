import { z } from 'zod';
import { db, InputError } from './db';
import { hashPassword } from './passwords';
const seat = z.number().int().min(1).max(3).nullable();
export async function createAdmin(input: unknown) {
  const data = z
    .object({
      name: z.string().trim().min(1).max(80),
      password: z.string().min(12).max(128),
      seat,
    })
    .safeParse(input);
  if (!data.success)
    throw new InputError(
      'Enter a name, a password of 12–128 characters and a valid jury seat.',
    );
  const a = data.data;
  if (a.name.toLowerCase() === 'organizer')
    throw new InputError('Choose another account name.');
  const hash = await hashPassword(a.password);
  const rows =
    await db()`INSERT INTO admin_accounts(name,password_hash,seat) VALUES(${a.name},${hash},${a.seat}) ON CONFLICT DO NOTHING RETURNING id`;
  if (!rows.length)
    throw new InputError(
      'The account name or jury seat is already in use.',
      409,
    );
}
export async function assignSeat(input: unknown) {
  const data = z.object({ id: z.uuid(), seat }).safeParse(input);
  if (!data.success) throw new InputError('Choose an account and jury seat.');
  const a = data.data;
  await db().begin(async (tx) => {
    const [row] =
      await tx`SELECT seat FROM admin_accounts WHERE id=${a.id} FOR UPDATE`;
    if (!row) throw new InputError('Account not found.', 404);
    if (row.seat === a.seat) return;
    if (
      (await tx`SELECT 1 FROM pitch_ballots WHERE admin_id=${a.id} LIMIT 1`)
        .length
    )
      throw new InputError(
        'This judge has submitted ballots. Their seat is locked.',
        409,
      );
    try {
      await tx`UPDATE admin_accounts SET seat=${a.seat} WHERE id=${a.id}`;
    } catch (e) {
      if ((e as { code: string }).code === '23505')
        throw new InputError('That seat is occupied.', 409);
      throw e;
    }
  });
}
export async function vote(id: string | null, input: unknown) {
  if (!id)
    throw new InputError('Sign in with your individual jury account.', 403);
  const data = z
    .object({
      team: z.uuid(),
      p1: z.number().int().min(0).max(15),
      p2: z.number().int().min(0).max(15),
      p3: z.number().int().min(0).max(10),
      p4: z.number().int().min(0).max(10),
    })
    .safeParse(input);
  if (!data.success)
    throw new InputError(
      'Enter a score for each of the four pitch criteria within its range.',
    );
  const b = data.data;
  await db().begin(async (tx) => {
    const [a] =
      await tx`SELECT seat FROM admin_accounts WHERE id=${id} FOR SHARE`;
    if (!a?.seat)
      throw new InputError('Only an assigned juror can score a pitch.', 403);
    const [s] =
      await tx`SELECT id FROM submissions WHERE team_id=${b.team} LIMIT 1`;
    if (!s) throw new InputError('This team has no submission.', 409);
    await tx`INSERT INTO pitch_ballots(team_id,admin_id,p1,p2,p3,p4) VALUES(${b.team},${id},${b.p1},${b.p2},${b.p3},${b.p4})
      ON CONFLICT(team_id,admin_id) DO UPDATE SET p1=excluded.p1,p2=excluded.p2,p3=excluded.p3,p4=excluded.p4`;
  });
}
export async function reviewSubmission(by: string, input: unknown) {
  const parsed = z
    .object({
      run: z.uuid(),
      requirement: z.string().min(1).max(40),
      label: z.enum(['observed in demo', 'contradicted', 'unverified']),
      note: z.string().trim().min(1).max(1500),
      correctness: z.union([z.literal(0), z.literal(10), z.literal(20)]),
      disqualified: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success)
    throw new InputError(
      'Record the requirement, observation, decision and resulting correctness level.',
    );
  const { run, ...review } = parsed.data;
  const sql = db();
  await sql.begin(async (tx) => {
    const decision = { ...review, by };
    const rows =
      await tx`UPDATE judge_runs SET jury_review=${tx.json(decision)} WHERE id=${run} AND phase='complete' AND EXISTS(SELECT 1 FROM jsonb_array_elements(scorecard->'checks') c WHERE c->>'id'=${review.requirement}) RETURNING id`;
    if (!rows.length)
      throw new InputError(
        'Choose a requirement on a completed official report.',
        409,
      );
    await tx`INSERT INTO jury_decisions(run_id,decision) VALUES(${run},${tx.json(decision)})`;
  });
}
