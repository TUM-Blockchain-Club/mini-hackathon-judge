import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('playwright');
const { randomBytes } = await import('node:crypto');
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
  await desk.goto(origin + '/organizer');
  await desk.getByLabel('Organizer password').fill(password);
  await desk.getByRole('button', { name: 'Sign in' }).click();
  await desk.getByLabel('Team name').waitFor();
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
  const name = 'QA ' + Date.now();
  await desk.getByLabel('Team name').fill(name);
  await desk.getByRole('button', { name: 'Create team code' }).click();
  const code = await desk.locator('.admin-code').innerText();
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(origin + '/');

  await p.getByLabel('Team access code').fill(code);
  await p.getByLabel('Project title').fill('Wallet comparison');
  await p.getByLabel('Track', { exact: true }).selectOption('wallet');
  await p.getByLabel('Focus', { exact: true }).selectOption('wallet-B');
  await p.getByRole('button', { name: 'File upload' }).click();
  await p
    .locator('input[type=file]')
    .setInputFiles({
      name: 'observations.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('Wallet usability observation, fixture only.'),
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

  await p.getByRole('link', { name: 'Event brief' }).click();
  await p.getByRole('heading', { name: 'Software wallets' }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'Browser pass: organizer login, event setup, invitation, track/focus, upload receipt, artifact access, pitch and mobile layout.',
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
