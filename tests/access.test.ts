import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { sameOrigin } from '../lib/auth';
import { InputError } from '../lib/db';

test('mutations accept the app origin and reject mismatched or opaque browser origins', () => {
  const request = (headers: Record<string, string>) =>
    new Request('https://judge.example/submit', { method: 'POST', headers });
  sameOrigin(request({ origin: 'https://judge.example' }));
  sameOrigin(request({}));
  const rejected: Record<string, string>[] = [
    { origin: 'https://other.example' },
    { origin: 'http://judge.example' },
    { origin: 'null' },
    { origin: '' },
    { 'sec-fetch-site': 'cross-site' },
  ];
  for (const headers of rejected) {
    assert.throws(
      () => sameOrigin(request(headers)),
      (error) => error instanceof InputError && error.status === 403,
    );
  }
});

test(
  'schema setup removes client-role grants and keeps the event data private on upgrades',
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    const owner = postgres(url.href, { max: 1, onnotice: () => {} });
    const schema = 'access_test_' + randomUUID().replaceAll('-', '');
    await owner.unsafe('CREATE SCHEMA ' + schema);
    url.searchParams.set('options', '-c search_path=' + schema);
    const sql = postgres(url.href, { max: 1, onnotice: () => {} });
    try {
      const setup = await readFile(
        new URL('../scripts/schema.sql', import.meta.url),
        'utf8',
      );
      await sql.unsafe(setup);
      // Model a prior install with default table grants. Check the catalog only.
      const roles =
        await sql`SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')`;
      for (const { rolname } of roles) {
        await sql`GRANT ALL ON ALL TABLES IN SCHEMA ${sql(schema)} TO ${sql(rolname)}`;
        await sql`GRANT ALL ON SEQUENCE jury_decisions_id_seq TO ${sql(rolname)}`;
      }
      await sql`GRANT SELECT ON submissions TO PUBLIC`;
      await sql.unsafe(setup);
      const tables = await sql`SELECT oid,relname,relrowsecurity FROM pg_class
      WHERE relnamespace=${schema}::regnamespace AND relkind='r'`;
      assert.ok(tables.some((t) => t.relname === 'judge_runs'));
      assert.ok(tables.some((t) => t.relname === 'organizer_sessions'));
      for (const table of tables)
        assert.equal(table.relrowsecurity, true, table.relname);
      const publicGrants = await sql`SELECT c.relname FROM pg_class c,
      LATERAL aclexplode(c.relacl) grant_entry
      WHERE c.relnamespace=${schema}::regnamespace AND c.relkind IN ('r','S')
      AND grant_entry.grantee=0`;
      assert.deepEqual([...publicGrants], []);
      for (const { rolname } of roles) {
        const grants =
          await sql`SELECT relname FROM pg_class WHERE relnamespace=${schema}::regnamespace AND relkind='r'
        AND has_table_privilege(${rolname},oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`;
        assert.deepEqual(Array.from(grants), [], rolname);
        const [sequence] =
          await sql`SELECT has_sequence_privilege(${rolname},'jury_decisions_id_seq','USAGE,SELECT,UPDATE') AS granted`;
        assert.equal(sequence.granted, false, rolname);
      }
      const [settings] = await sql`SELECT singleton FROM event_settings`;
      assert.equal(settings.singleton, true);
    } finally {
      await sql.end();
      await owner.unsafe('DROP SCHEMA ' + schema + ' CASCADE');
      await owner.end();
    }
  },
);
