import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import postgres from 'postgres';
import { db } from '../lib/db';
import * as teams from '../app/api/team/[action]/route';
import * as organizer from '../app/api/organizer/[action]/route';
import * as adminTeams from '../app/api/admin/teams/route';
import * as submissions from '../app/api/submissions/route';
import * as artifacts from '../app/api/artifacts/[id]/route';
import * as evidence from '../app/api/evidence/[id]/route';

const url = 'https://judge.example';
const get = () => new Request(url);
const post = (body: object) =>
  new Request(url, { method: 'POST', body: JSON.stringify(body) });
async function expectStatus(response: Promise<Response>, expected: number) {
  assert.equal((await response).status, expected);
}
const action = (action: string) => ({ params: Promise.resolve({ action }) });
const resource = (id: string) => ({ params: Promise.resolve({ id }) });
const password = 'private-fixture-password-only';
const members = [
  { firstName: 'Example', surname: 'Member' },
  { firstName: 'Second', surname: 'Teammate' },
];
const roster = (name: string) => ({ name, password, members });
function project(focus = 'tax-A', ownTopic?: string) {
  const form = new FormData();
  form.set('title', 'Example project');
  form.set('focus', focus);
  if (ownTopic !== undefined) form.set('ownTopic', ownTopic);
  form.set('repository', 'https://github.com/example/project');
  form.set('description', 'Fixture project description');
  return new Request(url, { method: 'POST', body: form });
}

describe(
  'portal route permissions',
  { skip: !process.env.TEST_DATABASE_URL },
  () => {
    let jar = new Map<string, string>();
    let setup: ReturnType<typeof postgres>;
    const schema = 'portal_test_' + randomUUID().replaceAll('-', '');
    const headers: { cookies: () => Promise<unknown> } = createRequire(
      import.meta.url,
    )('next/headers');

    before(async () => {
      const archive = await readFile(new URL('./fixtures/github-head.zip', import.meta.url));
      mock.method(globalThis, 'fetch', async (url: string) => {
        assert.equal(url, 'https://codeload.github.com/example/project/zip/HEAD');
        return new Response(new Uint8Array(archive));
      });
      const target = new URL(process.env.TEST_DATABASE_URL!);
      setup = postgres(target.href, { max: 1, onnotice: () => {} });
      await setup.unsafe('CREATE SCHEMA ' + schema);
      target.searchParams.set(
        'options',
        '-c search_path=' + schema + ' -c client_min_messages=warning',
      );
      process.env.DATABASE_URL = target.href;
      process.env.ORGANIZER_PASSWORD = password;
      await db().unsafe(
        await readFile(
          new URL('../scripts/schema.sql', import.meta.url),
          'utf8',
        ),
      );
      // Exercise the production handlers and database, replacing only Next's cookie transport.
      mock.method(headers, 'cookies', async () => ({
        get: (key: string) =>
          jar.has(key) ? { value: jar.get(key) } : undefined,
        set: (key: string, value: string) => jar.set(key, value),
        delete: (key: string) => jar.delete(key),
      }));
    });

    beforeEach(async () => {
      jar = new Map();
      await db()`TRUNCATE teams, admin_accounts, organizer_sessions, login_attempts CASCADE`;
      await db()`UPDATE event_settings SET deadline=now()+interval '1 day'`;
    });
    after(async () => {
      mock.restoreAll();
      await db().end();
      await setup.unsafe('DROP SCHEMA ' + schema + ' CASCADE');
      await setup.end();
    });

    it('requires a team login to submit and a separate admin login to manage the event', async () => {
      await expectStatus(submissions.POST(post({})), 401);
      await expectStatus(teams.GET(get(), action('directory')), 401);
      await expectStatus(adminTeams.GET(), 401);
      await expectStatus(organizer.POST(post({}), action('judge')), 401);
      await expectStatus(
        teams.POST(post(roster('Viewers')), action('register')),
        201,
      );
      await expectStatus(adminTeams.GET(), 401);
      await expectStatus(organizer.POST(post({}), action('judge')), 401);
      await expectStatus(artifacts.GET(get(), resource(randomUUID())), 401);
      await expectStatus(evidence.GET(get(), resource(randomUUID())), 401);
    });

    it('rejects invalid rosters and case-insensitive duplicates, and limits directory fields', async () => {
      for (const data of [
        roster('two words'),
        { ...roster('Empty'), members: [] },
        { ...roster('Solo'), members: [members[0]], admin: true },
        { ...roster('Crowded'), members: Array(4).fill(members[0]) },
      ])
        await expectStatus(teams.POST(post(data), action('register')), 400);
      await expectStatus(
        teams.POST(post(roster('Viewers')), action('register')),
        201,
      );
      await expectStatus(
        teams.POST(post(roster('Directory_A')), action('register')),
        201,
      );
      await expectStatus(
        teams.POST(post(roster('directory_a')), action('register')),
        409,
      );
      const directory = await teams.GET(get(), action('directory'));
      assert.equal(directory.status, 200);
      assert.deepEqual(await directory.json(), [
        { name: 'Viewers', members, memberCount: 2 },
      ]);
    });

    it('rejects stale team submissions and signs out each teammate independently', async () => {
      const account = roster('Shared_Team');
      await expectStatus(teams.POST(post(account), action('register')), 201);
      const firstDevice = jar;
      jar = new Map();
      await expectStatus(teams.POST(post(account), action('login')), 200);
      const peerDevice = jar;
      const peer = await (await teams.GET(get(), action('me'))).json();
      jar = firstDevice;
      const form = new FormData();
      form.set('sessionTeam', randomUUID());
      await expectStatus(
        submissions.POST(new Request(url, { method: 'POST', body: form })),
        401,
      );
      await expectStatus(teams.POST(post({}), action('logout')), 200);
      await expectStatus(teams.GET(get(), action('me')), 401);
      jar = peerDevice;
      assert.equal(
        (await (await teams.GET(get(), action('me'))).json()).id,
        peer.id,
      );
      const [count] =
        await db()`SELECT count(*)::int AS n FROM submissions WHERE team_id=${peer.id}`;
      assert.equal(count.n, 0);
    });

    it('revokes the organizer session on logout and denies expired sessions', async () => {
      const login = () => organizer.POST(post({ password }), action('login'));
      await expectStatus(login(), 200);
      const firstDevice = new Map(jar);
      jar = new Map();
      await expectStatus(login(), 200);
      const otherDevice = jar;
      jar = new Map(firstDevice);
      await expectStatus(organizer.POST(post({}), action('logout')), 200);
      jar = firstDevice;
      await expectStatus(adminTeams.GET(), 401);
      jar = otherDevice;
      await expectStatus(adminTeams.GET(), 200);
      for (const route of [artifacts, evidence])
        await expectStatus(route.GET(get(), resource('broken-link')), 404);
      await db()`UPDATE organizer_sessions SET expires_at=now()-interval '1 second'`;
      await expectStatus(adminTeams.GET(), 401);
    });

    it('blocks login when the attempt limit is reached and allows it after the window resets', async () => {
      const login = (value: string) =>
        organizer.POST(post({ password: value }), action('login'));
      await expectStatus(login('incorrect-fixture-password'), 401);
      await db()`UPDATE login_attempts SET attempts=15`;
      await expectStatus(login(password), 429);
      await expectStatus(adminTeams.GET(), 401);
      await db()`UPDATE login_attempts SET starts=now()-interval '6 minutes'`;
      await expectStatus(login(password), 200);
      await expectStatus(adminTeams.GET(), 200);
    });

    it('requires a custom focus for own topics and only returns the signed-in team’s latest revision', async () => {
      await expectStatus(
        teams.POST(post(roster('Own_Topic')), action('register')),
        201,
      );
      for (const topic of [undefined, '   ', 'x'.repeat(201)]) {
        await expectStatus(submissions.POST(project('tax-own', topic)), 400);
      }
      const topic = 'Compare handling of staking rewards';
      const receipt = await submissions.POST(
        project('tax-own', '  ' + topic + '  '),
      );
      assert.equal(receipt.status, 201);
      assert.equal((await receipt.json()).ownTopic, topic);
      const latest = async () =>
        (await (await submissions.GET()).json()).receipt;
      assert.equal((await latest()).ownTopic, topic);
      assert.equal((await latest()).description, 'Fixture project description');
      assert.equal((await latest()).commitUrl, 'https://github.com/example/project/commit/' + '1'.repeat(40));
      const device = jar;
      jar = new Map();
      assert.equal(await latest(), null);
      await expectStatus(
        teams.POST(post(roster('Other_Team')), action('register')),
        201,
      );
      assert.equal(await latest(), null);
      jar = device;
      await expectStatus(
        submissions.POST(project('tax-B', 'stale topic')),
        201,
      );
      assert.equal((await latest()).ownTopic, null);
    });

    it('rejects revisions immediately after the deadline and preserves the on-time receipt', async () => {
      await expectStatus(
        teams.POST(post(roster('Deadline')), action('register')),
        201,
      );
      const onTime = await submissions.POST(project());
      assert.equal(onTime.status, 201);
      const receipt = await onTime.json();
      assert.equal(receipt.late, false);
      await db()`UPDATE event_settings SET deadline=clock_timestamp()-interval '1 millisecond'`;
      await expectStatus(submissions.POST(project()), 409);
      const rows =
        await db()`SELECT id FROM submissions ORDER BY submitted_at DESC`;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, receipt.id);
    });

    it('rejects a first submission that reaches storage after the cutoff during repository capture', async () => {
      await expectStatus(teams.POST(post(roster('Capture_Cutoff')), action('register')), 201);
      const archive = await readFile(new URL('./fixtures/github-head.zip', import.meta.url));
      const capture = mock.method(globalThis, 'fetch', async () => {
        await db()`UPDATE event_settings SET deadline=clock_timestamp()`;
        return new Response(new Uint8Array(archive));
      });
      try {
        await expectStatus(submissions.POST(project()), 409);
        assert.equal(capture.mock.callCount(), 1);
        assert.equal((await db()`SELECT id FROM submissions`).length, 0);
      } finally {
        capture.mock.restore();
      }
    });

    it('counts one valid pitch ballot per assigned judge and team', async () => {
      await expectStatus(
        teams.POST(post(roster('Pitch')), action('register')),
        201,
      );
      const { id } = await (await teams.GET(get(), action('me'))).json();
      await expectStatus(submissions.POST(project()), 201);
      const ballot = { team: id, p1: 10, p2: 15, p3: 8, p4: 10 };
      await expectStatus(
        organizer.POST(post({ password }), action('login')),
        200,
      );
      await expectStatus(organizer.POST(post(ballot), action('pitch')), 403);
      const juror = { name: 'Juror', password, seat: 1 };
      await expectStatus(organizer.POST(post(juror), action('admin')), 200);
      await expectStatus(organizer.POST(post(juror), action('login')), 200);
      await expectStatus(
        organizer.POST(post({ ...ballot, p1: 16 }), action('pitch')),
        400,
      );
      await expectStatus(organizer.POST(post(ballot), action('pitch')), 200);
      await expectStatus(
        organizer.POST(post({ ...ballot, p1: 12 }), action('pitch')),
        200,
      );
      const ballots =
        await db()`SELECT p1 FROM pitch_ballots WHERE team_id=${id}`;
      assert.deepEqual([...ballots], [{ p1: 12 }]);
    });

    it('lets a team admin manage rosters while reserving jury access and judging for the assigned roles', async () => {
      await expectStatus(
        organizer.POST(post({ password }), action('login')),
        200,
      );
      const helper = { name: 'Roster_helper', password, seat: null };
      await expectStatus(organizer.POST(post(helper), action('admin')), 200);
      jar = new Map();
      await expectStatus(organizer.POST(post(helper), action('login')), 200);
      await expectStatus(adminTeams.GET(), 200);
      await expectStatus(organizer.GET(get(), action('guide')), 403);
      await expectStatus(organizer.POST(post({}), action('judge')), 403);
      await expectStatus(evidence.GET(get(), resource(randomUUID())), 401);
    });
  },
);
