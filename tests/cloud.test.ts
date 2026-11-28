import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { issueTicket, verifyTicket, jobName } from '../judge/cloud';

process.env.ORGANIZER_PASSWORD = 'test-only-secret-for-the-cloud-callback';

test('worker tickets are bound to the submission, purpose and expiry', () => {
  const id = randomUUID(),
    header = 'Bearer ' + issueTicket(id);
  verifyTicket(id, header);
  assert.throws(() => verifyTicket(randomUUID(), header));
  assert.throws(() => verifyTicket(id, header, 'probe'));
  assert.throws(() =>
    verifyTicket(id, header.replace(/\d{13}/, '1000000000000')),
  );
});

test('missing Gemini credentials stop judging before a model request', async () => {
  const { checkModelAccess } = await import('../judge/model');
  const prior = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(
      checkModelAccess('gemini-fixture'),
      /Set GEMINI_API_KEY/,
    );
  } finally {
    if (prior !== undefined) process.env.GEMINI_API_KEY = prior;
  }
});

test(
  'cloud worker claims, chunked downloads and evidence are isolated across runs',
  { skip: !process.env.TEST_DATABASE_URL },
  async (context) => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    const admin = postgres(url.href, { max: 1, onnotice: () => {} });
    const schema = 'cloud_test_' + randomUUID().replaceAll('-', '');
    await admin.unsafe('CREATE SCHEMA ' + schema);
    url.searchParams.set('options', '-c search_path=' + schema);
    process.env.DATABASE_URL = url.href;
    const { db } = await import('../lib/db');
    const { POST } = await import('../app/api/judge/[id]/[action]/route');
    const sql = db();
    try {
      await sql.unsafe(
        await readFile(
          new URL('../scripts/schema.sql', import.meta.url),
          'utf8',
        ),
      );
      const content = Buffer.concat([
        Buffer.alloc(1024 * 1024, 11),
        Buffer.from('tail'),
      ]);
      const [team] =
        await sql`INSERT INTO teams(name,code_hash) VALUES('Fixture','test') RETURNING id`;
      const topic = 'Compare offline wallet recovery workflows';
      const [sub] =
        await sql`INSERT INTO submissions(team_id,title,focus,own_topic,source,filename,content,digest) VALUES(${team.id},'Fixture','wallet-own',${topic},'upload','file.txt',${content},'digest') RETURNING id`;
      const criteria = [
        {
          id: 'sample',
          title: 'Sample',
          max: 50,
          guidance: 'Check the file contents.',
        },
      ];
      const [run] =
        await sql`INSERT INTO judge_runs(submission_id,until_at,rubric,model,snapshot) VALUES(${sub.id},now()+interval '15 minutes',${sql.json({ criteria })},'fixture','image') RETURNING id`;
      const id = String(run.id),
        token = issueTicket(id);
      const call = (
        action: string,
        owner = 'one',
        body: object = {},
        query = '',
        bearer = token,
      ) =>
        POST(
          new Request('https://fixture.invalid/' + action + query, {
            method: 'POST',
            headers: {
              authorization: 'Bearer ' + bearer,
              'x-judge-execution': jobName + '-' + owner,
            },
            body: JSON.stringify(body),
          }),
          { params: Promise.resolve({ id, action }) },
        );
      assert.equal((await call('claim', 'one', {}, '', 'invalid')).status, 401);
      assert.equal((await (await call('claim')).json()).size, content.length);
      assert.equal((await (await call('claim', 'two')).json()).claimed, false);
      assert.equal((await call('artifact', 'two', {}, '?part=1')).status, 403);
      assert.equal(
        await (await call('artifact', 'one', {}, '?part=1')).text(),
        'tail',
      );
      assert.equal((await call('artifact', 'one', {}, '?part=-1')).status, 400);
      assert.equal((await call('finalize')).status, 409);
      const obs = { ref: 'I01-1', command: 'cat file.txt', output: 'recorded' };
      assert.equal((await call('observe', 'one', obs)).status, 200);
      await call('observe', 'one', { ...obs, output: 'duplicate' });
      assert.equal(
        (await sql`SELECT output FROM observations WHERE run_id=${id}`)[0]
          .output,
        'recorded',
      );
      assert.equal(
        (await call('observe', 'one', { ...obs, ref: 'V01-1' })).status,
        409,
      );
      process.env.GEMINI_API_KEY = 'fixture-google-key';
      context.mock.method(
        globalThis,
        'fetch',
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          assert.equal(
            new URL(request.url).origin,
            'https://generativelanguage.googleapis.com',
          );
          assert.equal(
            request.headers.get('x-goog-api-key'),
            'fixture-google-key',
          );
          const body = await request.text();
          assert.ok(body.includes(topic));
          const output = body.includes('priorityCriterion')
            ? { commands: ['cat file.txt'], covered: true }
            : {
                rows: [
                  {
                    id: 'sample',
                    points: 50,
                    reason: 'Verified fixture result.',
                    evidence: [{ ref: 'V01-1', location: 'file.txt line 1' }],
                  },
                ],
              };
          return Response.json({
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: JSON.stringify(output) }],
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 1,
              candidatesTokenCount: 1,
              totalTokenCount: 2,
            },
          });
        },
      );
      await sql`UPDATE judge_runs SET until_at=now()+interval '4 minutes' WHERE id=${id}`;
      const plan = await call('plan', 'one', { turn: 1, phase: 'crosscheck' });
      assert.deepEqual(await plan.json(), {
        commands: ['cat file.txt'],
        covered: true,
      });
      assert.equal(
        (await call('observe', 'one', { ...obs, ref: 'V01-1' })).status,
        200,
      );
      assert.equal((await call('finalize')).status, 200);
      assert.equal((await call('finalize')).status, 200);
      assert.equal(
        (await sql`SELECT points FROM judge_runs WHERE id=${id}`)[0].points,
        50,
      );
      assert.equal(
        (await call('review', 'one', { issue: 'Late duplicate' })).status,
        409,
      );
      assert.equal((await call('artifact', 'one', {}, '?part=0')).status, 409);
    } finally {
      await sql.end();
      await admin.unsafe('DROP SCHEMA ' + schema + ' CASCADE');
      await admin.end();
    }
  },
);
