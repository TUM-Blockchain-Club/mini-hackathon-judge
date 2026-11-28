import { randomBytes } from 'node:crypto';
import { hashPassword, matchesPassword } from './passwords';
import { cookies } from 'next/headers';
import { db, InputError } from './db';
import { newTeamCode, teamHash } from './auth';
import { digest } from './artifacts';
import {
  createInput,
  signupInput,
  teamNameInput,
  editInput,
  loginInput,
  type TeamProfile,
  type DirectoryTeam,
} from './registration';
import type { z } from 'zod';

const cookieName = 'tbc_team';
const sessionSeconds = 7 * 24 * 3600;
function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) throw new InputError(result.error.issues[0].message);
  return result.data;
}
export async function listTeams(): Promise<TeamProfile[]> {
  const sql = db();
  return sql<
    TeamProfile[]
  >`SELECT t.id,t.name,COALESCE(p.members,'[]'::jsonb) AS members,COALESCE(p.revision,0) AS revision FROM teams t LEFT JOIN team_profiles p ON p.team_id=t.id ORDER BY lower(t.name),t.id`;
}
export async function otherTeams(teamId: string): Promise<DirectoryTeam[]> {
  const teams = await db()<
    Pick<TeamProfile, 'name' | 'members'>[]
  >`SELECT t.name, COALESCE(p.members, '[]'::jsonb) AS members
    FROM teams t LEFT JOIN team_profiles p ON p.team_id=t.id
    WHERE t.id <> ${teamId} ORDER BY lower(t.name), t.id`;
  return teams.map(({ name, members }) => ({
    name,
    memberCount: members.length || null,
    members: members.map(({ firstName, surname }) => ({ firstName, surname })),
  }));
}

export async function saveRoster(
  input: unknown,
  options: { signupToken: string } | { admin: true; teamId?: string },
) {
  const teamId = 'admin' in options ? options.teamId : undefined;
  const creationSchema = 'admin' in options ? createInput : signupInput;
  const data = teamId ? parse(editInput, input) : parse(creationSchema, input);
  const hash = data.password ? await hashPassword(data.password) : null;
  return db().begin(async (tx) => {
    // Serialize competing names including case variants and legacy invite-only teams.
    await tx`SELECT pg_advisory_xact_lock(hashtext(lower(${data.name})))`;
    const collisions =
      await tx`SELECT id FROM teams WHERE lower(name)=lower(${data.name}) AND id IS DISTINCT FROM ${teamId ?? null}::uuid`;
    if (collisions.length)
      throw new InputError('That team name is taken.', 409);
    let id = teamId;
    if (id) {
      const [team] =
        await tx`SELECT id,name FROM teams WHERE id=${id} FOR UPDATE`;
      if (!team) throw new InputError('Team not found.', 404);
      if (team.name !== data.name) parse(teamNameInput, data.name);
      const [profile] =
        await tx`SELECT revision FROM team_profiles WHERE team_id=${id}`;
      if (!('revision' in data) || data.revision !== (profile?.revision ?? 0))
        throw new InputError(
          'This team changed. Reload its details before saving.',
          409,
        );
      if (profile && hash)
        throw new InputError('Leave the existing team password unchanged.');
      if (!profile && !hash)
        throw new InputError('Set a password to enable this team’s login.');
      await tx`UPDATE teams SET name=${data.name} WHERE id=${id}`;
      if (profile)
        await tx`UPDATE team_profiles SET members=${tx.json(data.members)},revision=revision+1 WHERE team_id=${id}`;
    } else {
      const [event] =
        await tx`SELECT started_at FROM event_settings WHERE singleton FOR SHARE`;
      if (event.started_at)
        throw new InputError(
          'Team registration has closed for this event.',
          409,
        );
      const [team] =
        await tx`INSERT INTO teams(name,code_hash) VALUES(${data.name},${teamHash(newTeamCode())}) RETURNING id`;
      id = String(team.id);
    }
    if (hash)
      await tx`INSERT INTO team_profiles(team_id,members,password_hash) VALUES(${id},${tx.json(data.members)},${hash})`;
    if ('signupToken' in options)
      await tx`INSERT INTO team_sessions(token_hash,team_id,expires_at) VALUES(${digest(options.signupToken)},${id},now()+interval '7 days')`;
    return { id };
  });
}
export async function deleteTeam(id: string, name: string, revision: number) {
  await db().begin(async (tx) => {
    // Serialize with the batch freeze before locking the team and its profile.
    await tx`SELECT singleton FROM event_settings WHERE singleton FOR SHARE`;
    const [team] = await tx`SELECT name FROM teams WHERE id=${id} FOR UPDATE`;
    if (!team) throw new InputError('Team not found.', 404);
    const [profile] =
      await tx`SELECT revision FROM team_profiles WHERE team_id=${id} FOR UPDATE`;
    if (team.name !== name || (profile?.revision ?? 0) !== revision)
      throw new InputError(
        'This team changed. Reload its details before deleting.',
        409,
      );
    const [frozen] =
      await tx`SELECT 1 FROM submissions s JOIN judge_runs j ON j.submission_id=s.id WHERE s.team_id=${id} LIMIT 1`;
    if (frozen)
      throw new InputError(
        'This team has a frozen judging run and must stay in the event record.',
        409,
      );
    await tx`DELETE FROM pitch_ballots WHERE team_id=${id}`;
    await tx`DELETE FROM submissions WHERE team_id=${id}`;
    await tx`DELETE FROM team_sessions WHERE team_id=${id}`;
    await tx`DELETE FROM team_profiles WHERE team_id=${id}`;
    await tx`DELETE FROM teams WHERE id=${id}`;
  });
}

export async function authenticateTeam(input: unknown) {
  const data = parse(loginInput, input),
    sql = db();
  const [p] =
    await sql`SELECT t.id,p.password_hash FROM teams t JOIN team_profiles p ON p.team_id=t.id WHERE lower(t.name)=lower(${data.name})`;
  if (!(await matchesPassword(data.password, p?.password_hash)))
    throw new InputError('Check your team name and password.', 401);
  const token = randomBytes(32).toString('hex');
  await sql`INSERT INTO team_sessions(token_hash,team_id,expires_at) VALUES(${digest(token)},${p.id},now()+interval '7 days')`;
  return token;
}
export async function setTeamCookie(token: string) {
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionSeconds,
  });
}
export async function currentTeam(): Promise<TeamProfile | null> {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  const sql = db();
  const [team] = await sql<
    TeamProfile[]
  >`SELECT t.id,t.name,p.members,p.revision FROM team_sessions s JOIN teams t ON t.id=s.team_id JOIN team_profiles p ON p.team_id=t.id WHERE s.token_hash=${digest(value)} AND s.expires_at>now()`;
  return team ?? null;
}
export async function signOutTeam() {
  const jar = await cookies();
  const value = jar.get(cookieName)?.value;
  if (value)
    await db()`DELETE FROM team_sessions WHERE token_hash=${digest(value)} OR expires_at<=now()`;
  jar.delete(cookieName);
}
