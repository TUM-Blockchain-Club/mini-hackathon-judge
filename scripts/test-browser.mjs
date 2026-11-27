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
  await desk.reload();
  await desk
    .locator('article')
    .filter({ hasText: name })
    .getByLabel('Pitch points')
    .fill('38');
  await desk
    .locator('article')
    .filter({ hasText: name })
    .getByRole('button', { name: 'Save pitch' })
    .click();
  await desk.getByText('Pitch score saved.').waitFor();
  await desk
    .locator('article')
    .filter({ hasText: name })
    .getByText('Pitch 38/50')
    .waitFor();
  const link = await desk
    .locator('article')
    .filter({ hasText: name })
    .getByRole('link', { name: 'observations.md' })
    .getAttribute('href');
  assert.equal((await desk.request.get(origin + link)).status(), 200);
  assert.equal((await p.request.get(origin + link)).status(), 401);
  await p.setViewportSize({ width: 390, height: 844 });
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
  assert.deepEqual(errors, []);
  console.log(
    'Browser pass: registration, roster bounds, duplicate rejection, login/logout, team isolation, admin create/inspect/edit, single-page submissions, revisions, legacy links and mobile layout.',
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
