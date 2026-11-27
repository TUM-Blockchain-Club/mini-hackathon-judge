import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { db, InputError } from './db';
import { digest } from './artifacts';
const cookieName = 'judge_organizer';
function secret() {
  if ((process.env.ORGANIZER_PASSWORD?.length ?? 0) < 24)
    throw new InputError('Organizer access has not been configured.', 503);
  return process.env.ORGANIZER_PASSWORD!;
}
const sign = (s: string) =>
  createHmac('sha256', secret()).update(s).digest('hex');
const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
export const newTeamCode = () => randomBytes(12).toString('hex').toUpperCase();
export const teamHash = (code: string) => digest(code.trim().toUpperCase());

export async function signedIn() {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value) return false;
  const [expiry, signature] = value.split('.');
  return (
    Number(expiry) > Date.now() && !!signature && equal(sign(expiry), signature)
  );
}
export async function login(password: string) {
  if (!equal(secret(), password))
    throw new InputError('Incorrect organizer password.', 401);
  const expiry = String(Date.now() + 12 * 3600_000);
  (await cookies()).set(cookieName, expiry + '.' + sign(expiry), {
    httpOnly: true,
    secure: !!process.env.VERCEL || process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 43200,
  });
}
export async function logout() {
  (await cookies()).delete(cookieName);
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
  if (
    origin &&
    (new URL(origin).host !== request.headers.get('host') ||
      !['https:', 'http:'].includes(new URL(origin).protocol))
  )
    throw new InputError('Request origin does not match.', 403);
}
