import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('playwright');
const { createHash, randomBytes } = await import('node:crypto');
const { spawn } = await import('node:child_process');
const { readFile } = await import('node:fs/promises');
const { default: postgres } = await import('postgres');
const { createServer } = await import('node:net');
if (!process.env.TEST_DATABASE_URL)
  throw Error('Set TEST_DATABASE_URL to a rehearsal PostgreSQL database.');
const database = new URL(process.env.TEST_DATABASE_URL),
  owner = postgres(database.href, { max: 1, onnotice: () => {} });
const schema = 'judge_ui_' + randomBytes(8).toString('hex'),
  password = randomBytes(24).toString('hex');
await owner.unsafe('CREATE SCHEMA ' + schema);
database.searchParams.set('options', '-c search_path=' + schema);
const isolated = postgres(database.href, { max: 1 });
const portServer = createServer();
await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const origin = 'http://127.0.0.1:' + port;
let browser, server;
try {
  await isolated.unsafe(
    await readFile(new URL('./schema.sql', import.meta.url), 'utf8'),
  );
  server = spawn(
    process.execPath,
    [
      require.resolve('next/dist/bin/next'),
      'start',
      '-p',
      String(port),
      '-H',
      '127.0.0.1',
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: database.href,
        ORGANIZER_PASSWORD: password,
      },
      stdio: 'inherit',
    },
  );
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw Error('Next.js could not start. Run npm run build first.');
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined,
    headless: true,
  });
  const desk = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  desk.on('pageerror', (e) => errors.push(e.message));
  const name = 'Team Portal QA',
    teamPassword = 'private-fixture-pass';
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  p.on('pageerror', (e) => errors.push(e.message));
  for (const oldPath of ['/', '/team', '/login', '/rules']) {
    const response = await p.request.get(origin + oldPath, { maxRedirects: 0 });
    assert.equal(response.status(), 308);
    assert.equal(
      new URL(response.headers().location, origin).pathname,
      '/submit',
    );
  }
  await p.goto(origin + '/');
  await p.getByRole('heading', { name: 'Project submission' }).waitFor();
  assert.equal(new URL(p.url()).pathname, '/submit');
  await p.getByLabel('Project title').fill('Draft before signup');
  await p.getByRole('radio', { name: 'File upload' }).check();
  await p.locator('input[type=file]').setInputFiles({
    name: 'draft.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Unsubmitted draft'),
  });
  const nav = p.getByRole('navigation', { name: 'Team portal' });
  await nav.getByRole('link', { name: 'Resources' }).click();
  await p.getByRole('heading', { name: 'Resources', exact: true }).waitFor();
  assert.equal(new URL(p.url()).pathname, '/resources');
  assert.equal(
    await nav
      .getByRole('link', { name: 'Resources' })
      .getAttribute('aria-current'),
    'page',
  );
  assert.equal(await p.getByRole('main').getByRole('link').count(), 6);
  assert.equal(
    await p.getByRole('textbox', { name: 'Project title' }).count(),
    0,
  );
  await nav.getByRole('link', { name: 'Submission', exact: true }).click();
  await p.getByRole('heading', { name: 'Project submission' }).waitFor();
  await p.goBack();
  await p.getByRole('heading', { name: 'Resources', exact: true }).waitFor();
  await p.goForward();
  await p.getByRole('heading', { name: 'Project submission' }).waitFor();
  assert.equal(
    await p.getByLabel('Project title').inputValue(),
    'Draft before signup',
  );
  assert.equal(
    await p
      .locator('input[type=file]')
      .evaluate((input) => input.files[0]?.name),
    'draft.txt',
  );
  await p.getByRole('button', { name: 'Register a team' }).click();
  await p.getByRole('heading', { name: 'Register your team' }).waitFor();
  await p.getByLabel('Team name', { exact: true }).fill(name);
  await p.locator('input[name=password]').fill(teamPassword);
  const names = [
    ['Jae', 'Park'],
    ['Ada', 'Fern'],
    ['Ren', 'Weiss'],
  ];
  for (const [i, [first, last]] of names.entries()) {
    if (i) await p.getByRole('button', { name: 'Add member' }).click();
    await p.getByLabel('First name', { exact: true }).nth(i).fill(first);
    await p.getByLabel('Surname', { exact: true }).nth(i).fill(last);
  }
  assert.equal(await p.getByRole('button', { name: 'Add member' }).count(), 0);
  await p.getByRole('button', { name: 'Register team' }).click();
  await p.getByRole('button', { name: 'Log out' }).waitFor();
  assert.equal(new URL(p.url()).pathname, '/submit');
  assert.equal(
    await p.getByLabel('Project title').inputValue(),
    'Draft before signup',
  );
  assert.equal(await p.getByText('Ada Fern').count(), 0);
  const me = await (await p.request.get(origin + '/api/team/me')).json();
  const creds = { name, password: teamPassword, members: me.members };
  for (const members of [[], [...me.members, me.members[0]]]) {
    assert.equal(
      (
        await p.request.post(origin + '/api/team/register', {
          data: { ...creds, members },
        })
      ).status(),
      400,
    );
  }
  assert.equal(
    (
      await p.request.post(origin + '/api/team/register', {
        data: { ...creds, name: name.toLowerCase() },
      })
    ).status(),
    409,
  );
  assert.equal(
    (await p.request.get(origin + '/api/admin/teams')).status(),
    401,
  );
  assert.equal(
    (
      await p.request.post(origin + '/api/admin/teams', { data: creds })
    ).status(),
    401,
  );
  assert.equal(
    (
      await p.request.patch(origin + '/api/admin/teams/' + me.id, {
        data: { ...creds, revision: me.revision },
      })
    ).status(),
    401,
  );
  await desk.goto(origin + '/admin');
  await desk.locator('input[name=password]').fill(password);
  await desk.getByRole('button', { name: 'Log in' }).click();
  await desk.getByRole('button', { name: name + ' 3 members' }).click();
  await desk.getByText('Ren Weiss').waitFor();
  await desk.getByRole('button', { name: 'Edit team' }).click();
  await desk.getByRole('button', { name: 'Remove member 3' }).click();
  await desk.getByLabel('Surname', { exact: true }).first().fill('Choi');
  await desk.getByRole('button', { name: 'Save changes' }).click();
  await desk.getByText('Jae Choi').waitFor();
  assert.equal(
    (
      await desk.request.patch(origin + '/api/admin/teams/' + me.id, {
        data: { name, members: me.members, revision: me.revision },
      })
    ).status(),
    409,
  );
  await desk.getByRole('button', { name: 'Create team' }).click();
  await desk.getByLabel('Team name', { exact: true }).fill('Solo fixture');
  await desk.locator('input[name=password]').fill(teamPassword);
  await desk.getByLabel('First name', { exact: true }).fill('Sam');
  await desk.getByLabel('Surname', { exact: true }).fill('Gray');
  await desk
    .locator('form')
    .getByRole('button', { name: 'Create team' })
    .click();
  await desk.getByRole('button', { name: 'Solo fixture 1 member' }).click();
  await desk.getByText('Sam Gray').waitFor();
  const solo = await browser.newContext();
  const soloLogin = await solo.request.post(origin + '/api/team/login', {
    data: { name: 'Solo fixture', password: teamPassword },
  });
  assert.equal(soloLogin.status(), 200);
  const soloProfile = await (
    await solo.request.get(origin + '/api/team/me')
  ).json();
  assert.deepEqual(soloProfile.members, [
    { firstName: 'Sam', surname: 'Gray' },
  ]);
  await solo.close();
  await p.reload();
  await p.getByText(name, { exact: true }).waitFor();
  assert.equal(await p.getByText('Ren Weiss').count(), 0);
  await p.getByRole('button', { name: 'Log out' }).click();
  await p.getByRole('button', { name: 'Team login' }).waitFor();
  assert.equal((await p.request.get(origin + '/api/team/me')).status(), 401);
  assert.equal(
    (
      await p.request.post(origin + '/api/team/login', {
        data: { name, password: 'wrong-password' },
      })
    ).status(),
    401,
  );
  await p.getByRole('button', { name: 'Team login' }).click();
  await p.getByLabel('Team name', { exact: true }).fill(name.toLowerCase());
  await p.locator('input[name=password]').fill(teamPassword);
  await p.getByRole('button', { name: 'Log in' }).click();
  await p.getByRole('button', { name: 'Log out' }).waitFor();
  assert.equal(new URL(p.url()).pathname, '/submit');
  await desk.getByRole('link', { name: 'Open judging desk' }).click();
  await desk.getByRole('heading', { name: 'Organizer desk' }).waitFor();
  if (
    !(await desk.getByLabel('Deadline in your browser’s time zone').isVisible())
  )
    await desk.getByText('Deadline and evaluation rubric').click();
  await desk
    .getByLabel('Deadline in your browser’s time zone')
    .fill(
      new Date(Date.now() + 86400_000 - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    );
  await desk.getByRole('button', { name: 'Save event settings' }).click();
  await desk.getByText('Event settings saved.').waitFor();
  assert.equal(
    (
      await p.request.post(origin + '/api/submissions', {
        multipart: { sessionTeam: soloProfile.id },
      })
    ).status(),
    401,
  );
  await p.reload();
  await p.getByLabel('Project title').fill('Wallet comparison');
  await p.getByLabel('Track', { exact: true }).selectOption('wallet');
  await p.getByLabel('Focus', { exact: true }).selectOption('wallet-B');
  await p.getByRole('radio', { name: 'File upload' }).check();
  await p.locator('input[type=file]').setInputFiles({
    name: 'observations.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Wallet usability observation, fixture only.'),
  });
  await p.getByRole('button', { name: 'Submit project' }).click();
  await p.getByText('Project received.').waitFor();
  assert.equal(new URL(p.url()).pathname, '/submit');
  await p.getByRole('button', { name: 'Submit a revision' }).click();
  await p.getByLabel('Project title').fill('Wallet comparison, revised');
  await p.getByLabel('Track', { exact: true }).selectOption('wallet');
  await p.getByLabel('Focus', { exact: true }).selectOption('wallet-A');
  await p.getByRole('radio', { name: 'File upload' }).check();
  await p.locator('input[type=file]').setInputFiles({
    name: 'observations.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Revised observation'),
  });
  await p.getByRole('button', { name: 'Submit project' }).click();
  await p.getByText('Project received.').waitFor();
  const voterPassword = 'ballot-fixture-password';
  const guidePath =
    process.env.TEST_JUDGING_GUIDE_FILE ||
    new URL('../tests/fixtures/jury-guide.md', import.meta.url);
  const guideBytes = await readFile(guidePath);
  assert.equal(
    (await p.request.get(origin + '/api/organizer/guide')).status(),
    401,
  );
  await desk.getByLabel('Confidential judging guide').setInputFiles({
    name: 'guide.md',
    mimeType: 'text/markdown',
    buffer: guideBytes,
  });
  await desk.getByRole('button', { name: 'Import guide' }).click();
  await desk.getByText('Private guide imported.').waitFor();
  assert.equal(
    await (await desk.request.get(origin + '/api/organizer/guide')).text(),
    guideBytes.toString(),
  );
  await desk.getByText('Admins and jury seats', { exact: true }).click();
  await desk.getByLabel('New admin name').fill('Event helper');
  await desk.getByLabel('Initial password').fill(voterPassword);
  await desk.getByRole('button', { name: 'Create admin' }).click();
  await desk.getByText('Admin account created.').waitFor();
  const helper = await browser.newContext();
  const api = '/api/organizer/';
  assert.equal(
    (
      await helper.request.post(origin + api + 'login', {
        data: { name: 'Event helper', password: voterPassword },
      })
    ).status(),
    200,
  );
  assert.equal(
    (await helper.request.get(origin + '/api/admin/teams')).status(),
    200,
  );
  assert.equal(
    (await helper.request.get(origin + api + 'guide')).status(),
    403,
  );
  assert.equal(
    (await helper.request.post(origin + api + 'admin', { data: {} })).status(),
    403,
  );
  assert.equal(
    (
      await helper.request.post(origin + api + 'pitch', {
        data: { team: me.id, p1: 10, p2: 10, p3: 9, p4: 9 },
      })
    ).status(),
    403,
  );
  await helper.close();
  for (const seat of [1, 2, 3]) {
    const judgeName = 'Judge ' + seat;
    assert.equal(
      (
        await desk.request.post(origin + api + 'admin', {
          data: { name: judgeName, password: voterPassword, seat },
        })
      ).status(),
      200,
    );
    const j = await browser.newPage();
    await j.goto(origin + '/organizer');
    await j.getByLabel('Admin name').fill(judgeName);
    await j.getByLabel('Organizer password').fill(voterPassword);
    await j.getByRole('button', { name: 'Sign in' }).click();
    const row = j.locator('article').filter({ hasText: name });
    for (const [id, points] of Object.entries({ p1: 10, p2: 10, p3: 9, p4: 9 }))
      await row.locator('input[name=' + id + ']').fill(String(points));
    await row.getByRole('button', { name: 'Save pitch' }).click();
    await j.getByText('Pitch score saved.').waitFor();
    await row
      .getByText(
        seat === 3
          ? 'Pitch 38/50 · 3/3 ballots'
          : 'Pitch pending · ' + seat + '/3 ballots',
      )
      .waitFor();
    assert.equal((await j.request.get(origin + api + 'guide')).status(), 200);
    assert.equal(
      (await j.request.post(origin + api + 'settings', { data: {} })).status(),
      403,
    );
    await j.close();
  }
  assert.equal(
    (
      await desk.request.post(origin + api + 'admin', {
        data: { name: 'Fourth voter', password: voterPassword, seat: 1 },
      })
    ).status(),
    409,
  );
  await desk.reload();
  const link = await desk
    .locator('article')
    .filter({ hasText: name })
    .getByRole('link', { name: 'observations.md' })
    .getAttribute('href');
  assert.equal((await desk.request.get(origin + link)).status(), 200);
  assert.equal((await p.request.get(origin + link)).status(), 401);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(origin + '/resources');
  await p
    .getByRole('link', { name: 'Student AI tools setup guide (PDF)' })
    .waitFor();
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.goto(origin + '/');
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );

  await p.getByRole('button', { name: 'Log out' }).click();
  await p.getByRole('button', { name: 'Use access code' }).click();
  const invite = randomBytes(12).toString('hex').toUpperCase();
  const inviteHash = createHash('sha256').update(invite).digest('hex');
  await isolated`INSERT INTO teams(name,code_hash) VALUES('Invite fixture',${inviteHash})`;
  await p.getByLabel('Team access code').fill(invite);
  await p.getByLabel('Project title').fill('Invite submission');
  await p.getByLabel('Track', { exact: true }).selectOption('wallet');
  await p.getByLabel('Focus', { exact: true }).selectOption('wallet-A');
  await p.getByRole('radio', { name: 'File upload' }).check();
  await p.locator('input[type=file]').setInputFiles({
    name: 'project.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Legacy team entry'),
  });
  await p.getByRole('button', { name: 'Submit project' }).click();
  await p.getByText('Project received.').waitFor();
  await p.getByText('Invite fixture ·', { exact: false }).waitFor();
  assert.equal(new URL(p.url()).pathname, '/submit');
  // Advance only this isolated event through its late window.
  await isolated`UPDATE event_settings SET deadline=clock_timestamp()-interval '4 minutes'`;
  const lateState = await (
    await p.request.get(origin + '/api/submissions')
  ).json();
  assert.equal(lateState.state, 'late');
  const upload = {
    code: invite,
    method: 'file',
    title: 'Late revision',
    focus: 'tax-own',
    file: {
      name: 'proof.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('revision'),
    },
  };
  const lateResponse = await p.request.post(origin + '/api/submissions', {
    multipart: upload,
  });
  assert.equal(lateResponse.status(), 201);
  assert.equal((await lateResponse.json()).late, true);
  await isolated`UPDATE event_settings SET deadline=clock_timestamp()-interval '11 minutes'`;
  assert.equal(
    (
      await p.request.post(origin + '/api/submissions', { multipart: upload })
    ).status(),
    409,
  );
  assert.equal(
    (await (await p.request.get(origin + '/api/submissions')).json()).state,
    'closed',
  );
  assert.equal(
    (
      await desk.request.post(origin + api + 'pitch', {
        data: { team: me.id, p1: 15, p2: 15, p3: 10, p4: 10 },
      })
    ).status(),
    403,
  );
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await desk.request.post(origin + api + 'admin', {
          data: {
            name: 'Extra admin ' + i,
            password: voterPassword,
            seat: null,
          },
        })
      ).status(),
      200,
    );

  // Rehearse a jury observation and an equal-score podium using saved ballots.
  const [inviteTeam] =
    await isolated`SELECT id FROM teams WHERE name='Invite fixture'`;
  const [event] =
    await isolated`SELECT rubric FROM event_settings WHERE singleton`;
  const rubric = {
    version: event.rubric.version,
    criteria: event.rubric.common,
  };
  const ev = [{ ref: 'I01-1', location: 'proof.txt line 1' }];
  const scorecard = {
    rows: rubric.criteria.map((c) => ({
      id: c.id,
      points: c.max / 2,
      reason: 'Synthetic check',
      evidence: ev,
    })),
    efficiencyApplicable: true,
    checks: [
      {
        id: 'R0-1',
        checked: 'Inspect fixture',
        result: 'Found',
        label: 'claimed only',
        credit: 'half',
        effect: 'Pending demo',
        violation: false,
        evidence: ev,
      },
    ],
    juryQuestions: ['Reproduce the fixture.'],
  };
  for (const id of [me.id, inviteTeam.id]) {
    const [sub] =
      await isolated`SELECT id FROM submissions WHERE team_id=${id} ORDER BY submitted_at DESC LIMIT 1`;
    await isolated`INSERT INTO judge_runs(submission_id,phase,until_at,rubric,model,snapshot,scorecard,points)
      VALUES(${sub.id},'complete',now(),${isolated.json(rubric)},'fixture','fixture',${isolated.json(scorecard)},25)`;
  }
  await isolated`INSERT INTO pitch_ballots(team_id,admin_id,p1,p2,p3,p4)
    SELECT ${inviteTeam.id},admin_id,15,10,9,9 FROM pitch_ballots WHERE team_id=${me.id}`;
  await desk.reload();
  const invitedRow = desk
    .locator('article')
    .filter({
      has: desk.getByRole('heading', { name: 'Invite fixture', exact: true }),
    });
  await invitedRow.getByText('Place 1', { exact: true }).waitFor();
  await invitedRow.getByText('Overall 63%').waitFor();
  // Equalize the pitch and submission components to trigger an unresolved tie.
  await isolated`UPDATE pitch_ballots SET p1=10 WHERE team_id=${inviteTeam.id}`;
  await isolated`UPDATE judge_runs SET points=30 WHERE submission_id IN (SELECT id FROM submissions WHERE team_id=${inviteTeam.id})`;
  await desk.reload();
  await invitedRow.getByText('Podium tie · jury decision needed').waitFor();
  const tieForm = desk.locator('details').filter({
    has: desk.locator('summary', { hasText: 'Record jury tie decision' }),
  });
  await desk.getByText('Record jury tie decision', { exact: true }).click();
  await tieForm.getByLabel('Tied team in position 1').selectOption(me.id);
  await tieForm
    .getByLabel('Tied team in position 2')
    .selectOption(inviteTeam.id);
  await tieForm
    .getByLabel('Jury rationale')
    .fill('Jury selected the more useful demonstration.');
  await desk.getByRole('button', { name: 'Save tie decision' }).click();
  await invitedRow.getByText('Place 2', { exact: true }).waitFor();
  await invitedRow
    .locator('summary')
    .filter({ hasText: 'AI scorecard' })
    .click();
  await invitedRow.getByLabel('Reviewed correctness').selectOption('20');
  await invitedRow
    .getByLabel('Jury observation and rationale')
    .fill('Jury reproduced the worked example.');
  await invitedRow.getByRole('button', { name: 'Record decision' }).click();
  await invitedRow.getByText('Place 1', { exact: true }).waitFor();
  assert.equal(
    (await isolated`SELECT count(*)::int n FROM jury_decisions`)[0].n,
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Browser pass: registration, roster bounds, duplicate rejection, login/logout, team isolation, admin create/inspect/edit, submission revisions, legacy links, mobile layout, private guide, jury seats, late cutoff, ballots, demo review and podium ties.',
  );
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server.once('exit', r));
    server.kill();
    await exited;
  }
  await isolated.end();
  await owner.unsafe('DROP SCHEMA ' + schema + ' CASCADE');
  await owner.end();
}
