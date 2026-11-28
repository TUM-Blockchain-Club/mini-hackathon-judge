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
  async (t) => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    const admin = postgres(url.href, { max: 1 });
    const schema = 'judge_test_' + randomBytes(8).toString('hex');
    await admin.unsafe('CREATE SCHEMA ' + schema);
    url.searchParams.set('options', '-c search_path=' + schema);
    process.env.DATABASE_URL = url.href;
    process.env.JUDGE_MODEL = 'rehearsal/model';
    process.env.JUDGE_SNAPSHOT_ID = 'rehearsal-snapshot';
    process.env.GEMINI_API_KEY = 'test';
    const { db } = await import('../lib/db');
    const {
      addTeam,
      requireTeam,
      configure,
      saveSubmission,
      freezeBatch,
      desk,
      latestReceipt,
      publicEvent,
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
          requireTeam(await addTeam('Team_' + i)),
        ),
      );
      await assert.rejects(addTeam('team_0'), /already exists/);
      await assert.rejects(addTeam('Team name'), /underscores/);
      await Promise.all(
        teams.map((t, i) => saveSubmission(t.id, 'Original', 'wallet-A', i === 0
          ? { ...data, source: 'https://github.com/example/original/commit/' + '0'.repeat(40) }
          : data)),
      );
      const revision = await saveSubmission(
        teams[0].id,
        'Final',
        'exchange-A',
        { ...data, filename: 'submission.zip', source: 'https://github.com/example/project/commit/' + '0'.repeat(40) },
      );
      await assert.rejects(freezeBatch());
      await new Promise((resolve) => setTimeout(resolve, 5));
      await db()`UPDATE submissions SET submitted_at=submitted_at-interval '12 minutes'`;
      const deadline = new Date(Date.now() - 601000);
      const cutoff = new Date(+deadline + 300000).toISOString();
      // The latest revision was late under the earlier deadline and on time after extension.
      const earlier = new Date(+deadline - 180000);
      await configure(earlier.toISOString());
      assert.equal((await latestReceipt(teams[0].id))?.late, true);
      await configure(deadline.toISOString());
      assert.equal((await latestReceipt(teams[0].id))?.late, false);
      assert.equal((await publicEvent()).commitDeadline, cutoff);
      const [saved] = await sql`SELECT rubric FROM event_settings WHERE singleton`;
      assert.deepEqual(saved.rubric, draftRubric);
      await assert.rejects(configure(new Date(+deadline - 900000).toISOString()), /exclude an accepted receipt/);
      assert.equal((await publicEvent()).commitDeadline, cutoff);
      const sha = '1'.repeat(40);
      const archive = await readFile(new URL('./fixtures/github-head.zip', import.meta.url));
      const github = t.mock.method(globalThis, 'fetch', async (input: string) => {
        const url = new URL(input);
        if (url.hostname === 'api.github.com') {
          assert.equal(url.pathname, '/repos/example/project/commits');
          assert.equal(url.searchParams.get('until'), cutoff);
          return Response.json([{ sha, commit: { committer: { date: cutoff } } }]);
        }
        assert.equal(url.href, 'https://codeload.github.com/example/project/zip/' + sha);
        return new Response(new Uint8Array(archive));
      });
      await assert.rejects(
        saveSubmission(teams[0].id, 'Late', 'wallet-A', data),
      );
      const [a, b] = await Promise.all([freezeBatch(), freezeBatch()]);
      assert.equal(github.mock.callCount(), 2);
      const [frozen] = await sql`SELECT archive_content, archive_source, rubric FROM judge_runs WHERE submission_id=${revision.id}`;
      assert.deepEqual(frozen.rubric.criteria, [...draftRubric.common, ...draftRubric.focuses['exchange-A']]);
      assert.deepEqual(frozen.archive_content, archive);
      assert.equal(frozen.archive_source, 'https://github.com/example/project/commit/' + sha);
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
