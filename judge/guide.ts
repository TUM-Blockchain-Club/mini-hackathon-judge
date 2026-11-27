import { officialRubric } from './official';
import { db, InputError } from '../lib/db';
import { digest } from '../lib/artifacts';
const sections = {
  exchange: ['### 2.1', '### 2.2', 'EX-'],
  wallet: ['### 2.2', '### 2.3', 'WA-'],
  tax: ['### 2.3', '## 3.', 'TX-'],
} as const;
function part(text: string, from: string, to: string) {
  const start = text.indexOf('\n' + from),
    end = text.indexOf('\n' + to, start + 1);
  if (start < 0 || end <= start)
    throw new InputError('The guide is missing section ' + from + '.');
  return text.slice(start, end);
}
export function trackGuide(raw: string, focus: string) {
  const text = raw.replaceAll('\r\n', '\n');
  const key = focus.split('-')[0] as keyof typeof sections;
  if (!Object.hasOwn(sections, key))
    throw new InputError('Unknown judging track.');
  const [from, to, prefix] = sections[key];
  const track = part(text, from, to);
  const common = part(text, '## 1.', '### 2.1');
  const evidence = part(text, '## 3.', '## 4.');
  const instructions = common + track + evidence;
  const ids = [
    ...instructions.matchAll(/^\| ((?:R0-\d+|(?:EX|WA|TX)-[ABC]\d+)) \|/gm),
  ].map((m) => m[1]);
  if (
    new Set(ids).size !== ids.length ||
    !Array.from({ length: 8 }, (_, i) => 'R0-' + (i + 1)).every((id) =>
      ids.includes(id),
    ) ||
    !ids.some((id) => id.startsWith(prefix))
  )
    throw new InputError('Missing requirement tables in judging guide.');
  return { instructions, ids, revision: digest(raw) };
}
export function validateGuide(raw: unknown) {
  if (
    typeof raw !== 'string' ||
    raw.length > 150000 ||
    !raw.includes('Internal Judging Guide')
  )
    throw new InputError('Choose the internal judging guide Markdown file.');
  for (const k of Object.keys(sections)) trackGuide(raw, k);
  return raw;
}

export async function importGuide(input: unknown) {
  const text = validateGuide(input),
    sql = db();
  const saved =
    await sql`UPDATE event_settings SET guide=${text},rubric=${sql.json(officialRubric)} WHERE singleton AND started_at IS NULL RETURNING singleton`;
  if (!saved.length)
    throw new InputError('The guide is frozen for this batch.', 409);
}
