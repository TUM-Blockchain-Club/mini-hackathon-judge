import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const deploy = process.argv.includes('--production-deploy');
if (deploy && process.env.VERCEL_ENV !== 'production') process.exit(0);
if (!process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL before initializing the event database.');

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const digest = createHash('sha256').update(schema).digest('hex');
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext('mini-hackathon-judge schema'))`;
    if (deploy) {
      const [ledger] =
        await tx`SELECT to_regclass('judge_schema_migrations') IS NOT NULL AS present`;
      if (
        ledger.present &&
        (await tx`SELECT 1 FROM judge_schema_migrations WHERE digest=${digest}`)
          .length
      )
        return;
    }
    await tx.unsafe(schema);
    await tx`INSERT INTO judge_schema_migrations(digest) VALUES(${digest}) ON CONFLICT DO NOTHING`;
  });
  console.log('Event database ready.');
} finally {
  await sql.end();
}
