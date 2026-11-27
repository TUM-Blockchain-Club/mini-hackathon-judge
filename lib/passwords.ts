import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return (
    salt + ':' + ((await derive(password, salt, 64)) as Buffer).toString('hex')
  );
}
export async function matchesPassword(password: string, hash?: string) {
  const [salt, expected] = (
    hash ?? '0'.repeat(32) + ':' + '0'.repeat(128)
  ).split(':');
  const key = (await derive(password, salt, 64)) as Buffer;
  return timingSafeEqual(key, Buffer.from(expected, 'hex')) && !!hash;
}
