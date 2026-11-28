import taxSample from './fixtures/tax-sample.json';
import { Sandbox } from '@vercel/sandbox';
import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { db } from '../lib/db';
import { grade, system, timeLeft, type Run } from './model';
export type { Run } from './model';
export async function claim(id: string, owner: string): Promise<Run | null> {
  'use step';
  const [r] =
    await db()`UPDATE judge_runs j SET worker=${owner},phase='inspecting' FROM submissions s WHERE j.id=${id} AND s.id=j.submission_id AND (worker IS NULL OR worker=${owner}) AND phase NOT IN ('complete','review') AND until_at>clock_timestamp()
    RETURNING j.until_at,j.rubric,j.model,j.snapshot,s.focus,s.own_topic`;
  return r
    ? {
        id,
        owner,
        until: +r.until_at,
        criteria: r.rubric.criteria,
        ...(r.rubric.guide ? { guide: r.rubric.guide } : {}),
        model: r.model,
        snapshot: r.snapshot,
        focus: r.focus,
        participantTopic: r.own_topic,
      }
    : null;
}
const boxName = (r: Run) => 'judge-' + r.id;
async function observe(run: Run, ref: string, command: string, output: string) {
  const [saved] =
    await db()`INSERT INTO observations(run_id,ref,command,output) VALUES(${run.id},${ref},${command},${output.slice(0, 6500)})
    ON CONFLICT(run_id,ref) DO UPDATE SET ref=excluded.ref RETURNING output`;
  return { ref, output: String(saved.output) };
}
async function history(run: Run) {
  const rows =
    await db()`SELECT ref,command,output FROM observations WHERE run_id=${run.id} ORDER BY ref`;
  return rows.map((r) => ({
    ref: String(r.ref),
    command: String(r.command),
    output: String(r.output),
  }));
}
const unpack = `import pathlib, zipfile, sys, shutil
src=pathlib.Path('/tmp/judge-input')
root=pathlib.Path('/srv/submission')
name=sys.argv[1]
if len(sys.argv)>2:
    reference=pathlib.Path('/srv/reference/taxtool-sample')
    reference.mkdir(parents=True,exist_ok=True)
    for filename in ('transactions.csv','prices.csv','expected-result.json'):
        target=reference/filename
        shutil.copyfile('/tmp/official-'+filename,target)
        target.chmod(0o444)
if name.lower().endswith('.zip'):
    with zipfile.ZipFile(src) as z:
        for item in z.infolist():
            dest=(root/item.filename).resolve()
            if not dest.is_relative_to(root): raise ValueError('Invalid archive path')
            if item.is_dir(): dest.mkdir(parents=True,exist_ok=True); continue
            dest.parent.mkdir(parents=True,exist_ok=True)
            with z.open(item) as f, dest.open('wb') as out: shutil.copyfileobj(f,out)
else: shutil.copyfile(src,root/name)
for p in sorted(root.rglob('*')):
    if p.is_file(): print(p.relative_to(root),p.stat().st_size)
`;
export async function prepare(run: Run) {
  'use step';
  const [s] =
    await db()`SELECT filename,content FROM submissions s JOIN judge_runs j ON j.submission_id=s.id WHERE j.id=${run.id}`;
  const box = await Sandbox.create({
    name: boxName(run),
    source: { type: 'snapshot', snapshotId: run.snapshot },
    resources: { vcpus: 2 },
    networkPolicy: 'deny-all',
    persistent: false,
    timeout: timeLeft(run.until, 900_000),
    signal: AbortSignal.timeout(timeLeft(run.until, 45_000)),
  });
  await box.writeFiles([
    { path: '/tmp/judge-input', content: Buffer.from(s.content) },
    ...(run.guide && run.focus.startsWith('tax-')
      ? Object.entries(taxSample.files).map(([filename, data]) => ({
          path: '/tmp/official-' + filename,
          content: Buffer.from(data),
        }))
      : []),
  ]);
  const cmd = await box.runCommand({
    cmd: 'python3',
    args: [
      '-c',
      unpack,
      s.filename,
      ...(run.guide && run.focus.startsWith('tax-') ? ['tax'] : []),
    ],
    sudo: true,
    signal: AbortSignal.timeout(timeLeft(run.until, 30_000)),
  });
  if (cmd.exitCode) throw Error('Sandbox could not open the frozen artifact.');
  const manifest = await cmd.stdout();
  const init = await box.runCommand({
    cmd: 'bash',
    sudo: true,
    signal: AbortSignal.timeout(timeLeft(run.until, 30_000)),
    args: [
      '-ec',
      'chmod -R a+rX,go-w /srv/submission; install -d -o judge-runner -g judge-runner /tmp/work; cp -r /srv/submission/. /tmp/work/; chown -R judge-runner /tmp/work; rm -f /tmp/judge-input',
    ],
  });
  if (init.exitCode) throw Error('Sandbox workspace initialization failed.');
  await observe(run, 'inventory', 'File inventory (paths and bytes)', manifest);
}
prepare.maxRetries = 0;
export async function inspectRound(
  run: Run,
  turn: number,
  phase: 'inspect' | 'crosscheck',
) {
  'use step';
  const phaseEnd = run.until - (phase === 'inspect' ? 300_000 : 65_000);
  if (Date.now() >= phaseEnd - 1500) return true;
  try {
    return await collectEvidence(run, turn, phase, phaseEnd);
  } catch (error) {
    // An expired inspection slice gives way to verification/scoring with the evidence already saved.
    if (Date.now() >= phaseEnd - 1500) return true;
    throw error;
  }
}
async function collectEvidence(
  run: Run,
  turn: number,
  phase: 'inspect' | 'crosscheck',
  phaseEnd: number,
) {
  const signal = AbortSignal.timeout(timeLeft(phaseEnd, 75_000));
  const sql = db();
  await sql`UPDATE judge_runs SET phase=${phase === 'inspect' ? 'inspecting' : 'cross-checking'} WHERE id=${run.id} AND phase NOT IN ('complete','review')`;
  const prev = await history(run);
  const box = await Sandbox.get({
    name: boxName(run),
    signal,
  });
  let calls = 0;
  const result = await generateText({
    model: run.model,
    system,
    maxRetries: 1,
    maxOutputTokens: 1100,
    abortSignal: signal,
    stopWhen: stepCountIs(2),
    prepareStep: ({ stepNumber }) => ({
      toolChoice:
        stepNumber === 0
          ? { type: 'tool' as const, toolName: 'inspect' }
          : ('none' as const),
    }),
    prompt: JSON.stringify({
      phase,
      turn,
      focus: run.focus,
      participantTopic: run.participantTopic ?? undefined,
      criteria: run.criteria,
      instructions: run.guide?.instructions,
      reference:
        run.guide && run.focus.startsWith('tax-')
          ? '/srv/reference/taxtool-sample contains the official transactions.csv, prices.csv and expected-result.json. Compare submitted output against these independent fixtures.'
          : undefined,
      priorityCriterion: run.criteria[(turn - 1) % run.criteria.length],
      observations: prev.map((o) => ({
        ...o,
        output: o.output.slice(0, o.ref === 'inventory' ? 5500 : 1300),
      })),
      task:
        phase === 'inspect'
          ? 'Use the inspect tool to collect missing evidence for every criterion. Open and interpret relevant artifacts. Run a reproduction where appropriate. Once sufficient, respond COVERED.'
          : 'Recheck the weakest finding or deduction independently. Inspect a specific source or run a countercheck before concluding COVERED.',
    }),
    tools: {
      inspect: tool({
        description:
          'Execute a shell command in this repo’s offline disposable working copy /tmp/work. Original files are under /srv/submission. Use judge-read FILE for spreadsheets, PDFs, DOCX, screenshot OCR and text. Return file/cell citations. Keep command output focused.',
        inputSchema: z.object({ command: z.string().min(1).max(1600) }),
        execute: async ({ command }) => {
          if (++calls > 2) return { error: 'Turn tool budget reached.' };
          const ref =
            (phase === 'inspect' ? 'I' : 'V') +
            String(turn).padStart(2, '0') +
            '-' +
            calls;
          const cached = prev.find((o) => o.ref === ref);
          if (cached) return cached;
          const limit = timeLeft(phaseEnd, 20_000);
          const cmd = await box.asUser('judge-runner').runCommand({
            cmd: 'bash',
            cwd: '/tmp/work',
            args: [
              '-c',
              'set -o pipefail; timeout -k 1s 12s bash -c "$1" 2>&1 | head -c 6000',
              'judge',
              command,
            ],
            signal: AbortSignal.any([signal, AbortSignal.timeout(limit)]),
          });
          return observe(
            run,
            ref,
            command,
            'exit ' + cmd.exitCode + '\n' + (await cmd.stdout()),
          );
        },
      }),
    },
  });
  return (
    result.text.trim().endsWith('COVERED') &&
    turn >= 2 &&
    prev.some((o) => o.ref.startsWith(phase === 'inspect' ? 'I' : 'V'))
  );
}
inspectRound.maxRetries = 0;
export async function finalize(run: Run) {
  'use step';
  const sql = db(),
    evidence = await history(run);
  await sql`UPDATE judge_runs SET phase='scoring' WHERE id=${run.id} AND phase NOT IN ('complete','review')`;
  const { output, points } = await grade(run, evidence);
  const saved =
    await sql`UPDATE judge_runs SET phase='complete',points=${points},scorecard=${sql.json(output)},issue=NULL WHERE id=${run.id} AND worker=${run.owner} AND phase NOT IN ('complete','review') AND until_at>clock_timestamp() RETURNING id`;
  if (!saved.length) throw Error('Scorecard missed the batch deadline.');
}
finalize.maxRetries = 0;
export async function markReview(run: Run, reason: string) {
  'use step';
  await db()`UPDATE judge_runs SET phase='review',issue=${reason.slice(0, 500)} WHERE id=${run.id} AND worker=${run.owner} AND phase<>'complete'`;
}
export async function release(run: Run) {
  'use step';
  try {
    await (
      await Sandbox.get({
        name: boxName(run),
        signal: AbortSignal.timeout(8000),
      })
    ).stop({ signal: AbortSignal.timeout(8000) });
  } catch {
    /* The session also has an absolute expiry. */
  }
}
