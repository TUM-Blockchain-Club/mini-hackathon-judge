import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL before initializing the event database.');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
try {
  await sql.begin((tx) => tx.unsafe(schema));
  console.log('Event database ready.');
} finally {
  await sql.end();
}
