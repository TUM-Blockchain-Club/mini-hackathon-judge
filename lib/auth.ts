import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { db, InputError } from './db';
import { matchesPassword } from './passwords';
import { digest } from './artifacts';
const cookieName = 'judge_organizer';
function secret() {
  if ((process.env.ORGANIZER_PASSWORD?.length ?? 0) < 24)
    throw new InputError('Organizer access has not been configured.', 503);
  return process.env.ORGANIZER_PASSWORD!;
}
const ownerTokenPattern = /^owner\.[a-f0-9]{64}$/;
const ownerSessionHash = (token: string) =>
  createHmac('sha256', secret()).update(token).digest('hex');
const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
export const newTeamCode = () => randomBytes(12).toString('hex').toUpperCase();
export const teamHash = (code: string) => digest(code.trim().toUpperCase());

export type Admin = {
  id: string | null;
  name: string;
  owner: boolean;
  seat: number | null;
};
export async function currentAdmin(): Promise<Admin | null> {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value) return null;
  if (/^[a-f0-9]{64}$/.test(value)) {
    const [a] =
      await db()`SELECT a.id,a.name,a.seat FROM admin_sessions s JOIN admin_accounts a ON a.id=s.admin_id WHERE s.token_hash=${digest(value)} AND s.expires_at>now()`;
    return a ? { id: a.id, name: a.name, seat: a.seat, owner: false } : null;
  }
  if (!ownerTokenPattern.test(value)) return null;
  const [session] =
    await db()`SELECT 1 FROM organizer_sessions WHERE token_hash=${ownerSessionHash(value)} AND expires_at>now()`;
  return session
    ? { id: null, name: 'Organizer', seat: null, owner: true }
    : null;
}
export async function signedIn() {
  return !!(await currentAdmin());
}
export async function juryAccess() {
  const a = await currentAdmin();
  return !!a && (a.owner || !!a.seat);
}
export async function login(password: string, name = '') {
  let value: string;
  if (name.trim() && name.trim().toLowerCase() !== 'organizer') {
    if (name.length > 80 || password.length > 128)
      throw new InputError('Incorrect admin login.', 401);
    const [a] =
      await db()`SELECT id,password_hash FROM admin_accounts WHERE lower(name)=lower(${name.trim()})`;
    if (!(await matchesPassword(password, a?.password_hash)))
      throw new InputError('Incorrect admin login.', 401);
    value = randomBytes(32).toString('hex');
    await db()`INSERT INTO admin_sessions(token_hash,admin_id,expires_at) VALUES(${digest(value)},${a.id},now()+interval '12 hours')`;
  } else {
    if (!equal(secret(), password))
      throw new InputError('Incorrect organizer password.', 401);
    value = 'owner.' + randomBytes(32).toString('hex');
    await db()`INSERT INTO organizer_sessions(token_hash,expires_at) VALUES(${ownerSessionHash(value)},now()+interval '12 hours')`;
  }
  (await cookies()).set(cookieName, value, {
    httpOnly: true,
    secure: !!process.env.VERCEL || process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 43200,
  });
}
export async function logout() {
  const jar = await cookies();
  const value = jar.get(cookieName)?.value;
  if (value && /^[a-f0-9]{64}$/.test(value))
    await db()`DELETE FROM admin_sessions WHERE token_hash=${digest(value)}`;
  if (value && ownerTokenPattern.test(value))
    await db()`DELETE FROM organizer_sessions WHERE token_hash=${ownerSessionHash(value)} OR expires_at<=now()`;
  jar.delete(cookieName);
}
export async function throttle(
  request: Request,
  action: string,
  limit: number,
) {
  const ip =
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0] || 'local';
  const key = digest(action + ':' + ip);
  const [row] = await db()`INSERT INTO login_attempts(bucket) VALUES(${key})
    ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN login_attempts.starts < now()-interval '5 minutes' THEN 1 ELSE login_attempts.attempts+1 END,
    starts=CASE WHEN login_attempts.starts < now()-interval '5 minutes' THEN now() ELSE login_attempts.starts END RETURNING attempts`;
  if (row.attempts > limit)
    throw new InputError('Too many requests. Try again in five minutes.', 429);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin === null && request.headers.get('sec-fetch-site') !== 'cross-site')
    return;
  const url = new URL(request.url);
  const expectedHost = request.headers.get('host') || url.host;
  if (origin !== url.protocol + '//' + expectedHost)
    throw new InputError('Request origin does not match.', 403);
}
