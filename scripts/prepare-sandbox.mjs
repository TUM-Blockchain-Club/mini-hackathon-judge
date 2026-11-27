import { Sandbox } from '@vercel/sandbox';
import { readFile } from 'node:fs/promises';
const box = await Sandbox.create({
  image: 'vercel/sandbox/ubuntu',
  timeout: 600_000,
  persistent: false,
});
try {
  const imageSetup = await box.runCommand({
    cmd: 'bash',
    sudo: true,
    args: [
      '-ec',
      `
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y python3-openpyxl python3-docx poppler-utils tesseract-ocr nodejs
    id judge-runner >/dev/null 2>&1 || useradd -m -s /bin/bash judge-runner
    install -d -m 755 /srv/submission
  `,
    ],
  });
  if (imageSetup.exitCode) throw Error(await imageSetup.stderr());
  await box.writeFiles([
    {
      path: '/tmp/judge-read',
      content: await readFile(new URL('./judge-read.py', import.meta.url)),
    },
  ]);
  const copy = await box.runCommand({
    cmd: 'install',
    args: ['-m', '755', '/tmp/judge-read', '/usr/local/bin/judge-read'],
    sudo: true,
  });
  if (copy.exitCode) throw Error(await copy.stderr());
  const snapshot = await box.snapshot();
  console.log('JUDGE_SNAPSHOT_ID=' + snapshot.snapshotId);
} finally {
  await box.stop().catch(() => {});
}
