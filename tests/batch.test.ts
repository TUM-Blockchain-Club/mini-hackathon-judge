import test from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { draftRubric } from '../judge/rubric';
// Each test run gets a fresh schema in an explicitly supplied rehearsal database.
test(
  '11 teams freeze in parallel, revisions lock, duplicate workers exit and expiry preserves evidence',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    const admin = postgres(url.href, { max: 1 });
    const schema = 'judge_test_' + randomBytes(8).toString('hex');
    await admin.unsafe('CREATE SCHEMA ' + schema);
    url.searchParams.set('options', '-c search_path=' + schema);
    process.env.DATABASE_URL = url.href;
    process.env.JUDGE_MODEL = 'rehearsal/model';
    process.env.JUDGE_SNAPSHOT_ID = 'rehearsal-snapshot';
    process.env.AI_GATEWAY_API_KEY = 'test';
    const { db } = await import('../lib/db');
    const {
      addTeam,
      requireTeam,
      configure,
      saveSubmission,
      freezeBatch,
      desk,
    } = await import('../lib/store');
    const { claim, markReview } = await import('../judge/steps');
    const sql = db();
    try {
      await sql.unsafe(
        await readFile(
          new URL('../scripts/schema.sql', import.meta.url),
          'utf8',
        ),
      );
      await configure(new Date(Date.now() + 60000).toISOString(), draftRubric);
      const data = {
        bytes: Buffer.from('abc'),
        filename: 'result.md',
        source: 'upload',
        hash: 'abc',
      };
      const teams = await Promise.all(
        Array.from({ length: 11 }, async (_, i) =>
          requireTeam(await addTeam('Team ' + i)),
        ),
      );
      await Promise.all(
        teams.map((t) => saveSubmission(t.id, 'Original', 'wallet-A', data)),
      );
      const revision = await saveSubmission(
        teams[0].id,
        'Final',
        'exchange-A',
        data,
      );
      await assert.rejects(freezeBatch());
      await new Promise((resolve) => setTimeout(resolve, 5));
      await db()`UPDATE submissions SET submitted_at=submitted_at-interval '12 minutes'`;
      await configure(new Date(Date.now() - 601000).toISOString(), draftRubric);
      await assert.rejects(
        saveSubmission(teams[0].id, 'Late', 'wallet-A', data),
      );
      const [a, b] = await Promise.all([freezeBatch(), freezeBatch()]);
      assert.equal(a.length, 11);
      assert.deepEqual(new Set(a), new Set(b));
      const workers = await Promise.all(
        a.flatMap((id) =>
          ['worker1', 'worker2'].map((owner) => claim(id, owner)),
        ),
      );
      const winners = workers.filter((w) => w !== null);
      assert.equal(winners.length, 11);
      assert.equal((await freezeBatch()).length, 0);
      assert.equal(
        (await desk()).teams.find((t) => t.id === teams[0].id)?.submission,
        revision.id,
      );
      await assert.rejects(configure(new Date().toISOString(), draftRubric));
      const run = winners[0];
      await markReview(run, 'Model service interrupted');
      await sql`INSERT INTO observations VALUES(${run.id},'inventory','list','result.md')`;
      await sql`UPDATE judge_runs SET until_at=clock_timestamp()-interval '1 second'`;
      const all = await desk();
      assert.ok(
        all.teams.every((t) => t.phase === 'review' && t.points === null),
      );
      assert.equal((await sql`SELECT * FROM observations`).length, 1);
    } finally {
      await sql.end();
      await admin.unsafe('DROP SCHEMA ' + schema + ' CASCADE');
      await admin.end();
    }
  },
);
