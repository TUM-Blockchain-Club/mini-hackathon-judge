// Exercise the production orchestration against real PostgreSQL with a simulated clock and service adapters.
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { AsyncLocalStorage } from 'node:async_hooks';
const virtualTime = new AsyncLocalStorage<{ now: number }>();
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { judgeSubmission } from '../judge/workflow';
import { officialRubric } from '../judge/official';
import { importGuide } from '../judge/guide';
import {
  addTeam,
  configure,
  desk,
  freezeBatch,
  requireTeam,
  saveSubmission,
} from '../lib/store';
import { db } from '../lib/db';
const fake = vi.hoisted(() => ({
  now: 0,
  boxes: new Map<string, { content: string; closed: boolean }>(),
  clients: new Map<string, unknown>(),
}));
vi.mock('workflow', () => ({
  getWorkflowMetadata: () => ({ workflowRunId: crypto.randomUUID() }),
  sleep: async (date: Date) => {
    virtualTime.getStore()!.now = +date;
  },
}));
vi.mock('@vercel/sandbox', () => ({
  Sandbox: {
    create: async (config: {
      name: string;
      networkPolicy: string;
      source: { snapshotId: string };
    }) => {
      expect(config.networkPolicy).toBe('deny-all');
      expect(config.source.snapshotId).toBe('snap-fixture');
      expect(fake.boxes.has(config.name)).toBe(false);
      const state = { content: '', closed: false };
      fake.boxes.set(config.name, state);
      const box = {
        writeFiles: async (files: { content: Buffer }[]) => {
          state.content = files[0].content.toString();
        },
        runCommand: async () => ({
          exitCode: 0,
          stdout: async () => 'result.md 15',
        }),
        asUser: (name: string) => {
          expect(name).toBe('judge-runner');
          return {
            runCommand: async () => ({
              exitCode: 0,
              stdout: async () => state.content,
            }),
          };
        },
        stop: async () => {
          state.closed = true;
        },
      };
      fake.clients.set(config.name, box);
      return box;
    },
    get: async ({ name }: { name: string }) => fake.clients.get(name),
  },
}));
vi.mock('ai', async (load) => {
  const actual = await load<typeof import('ai')>();
  return {
    ...actual,
    generateText: async (opts: {
      prompt: string;
      tools?: {
        inspect: { execute: (arg: { command: string }) => Promise<unknown> };
      };
    }) => {
      const input = JSON.parse(opts.prompt);
      if (opts.tools) {
        await opts.tools.inspect.execute({ command: 'cat result.md' });
        return { text: 'COVERED' };
      }
      return {
        output: {
          checks: input.guide.ids.map((id: string) => ({
            id,
            checked: 'Read fixture',
            result: 'Fixture agrees',
            label: 'independently verified',
            credit: 'full',
            effect: 'Supports S1',
            violation: false,
            evidence: [{ ref: 'V01-1', location: 'result.md line 1' }],
          })),
          juryQuestions: ['Repeat the fixture check live.'],
          efficiencyApplicable: true,
          rows: input.criteria.map((c: { id: string; max: number }) => ({
            id: c.id,
            points: c.max / 2,
            reason: 'A fixture result was reproduced.',
            evidence: [{ ref: 'V01-1', location: 'result.md, line 1' }],
          })),
        },
      };
    },
  };
});
const schema = 'judge_dry_' + randomUUID().replaceAll('-', '');
let owner: ReturnType<typeof postgres>;
beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL)
    throw Error(
      'Use a dedicated rehearsal PostgreSQL database in TEST_DATABASE_URL.',
    );
  const url = new URL(process.env.TEST_DATABASE_URL);
  owner = postgres(url.href, { max: 1, onnotice: () => {} });
  await owner.unsafe('CREATE SCHEMA ' + schema);
  url.searchParams.set('options', '-c search_path=' + schema);
  process.env.DATABASE_URL = url.href;
  process.env.JUDGE_MODEL = 'fixture/model';
  process.env.JUDGE_SNAPSHOT_ID = 'snap-fixture';
  process.env.AI_GATEWAY_API_KEY = 'fixture';
  await db().unsafe(
    await readFile(new URL('../scripts/schema.sql', import.meta.url), 'utf8'),
  );
});
afterAll(async () => {
  vi.restoreAllMocks();
  if (owner) {
    await db().end();
    await owner.unsafe('DROP SCHEMA ' + schema + ' CASCADE');
    await owner.end();
  }
});
it('starts eleven independent judges and saves one evidence-backed scorecard per frozen submission', async () => {
  const guidePath =
    process.env.TEST_JUDGING_GUIDE_FILE ||
    new URL('./fixtures/jury-guide.md', import.meta.url);
  await importGuide(await readFile(guidePath, 'utf8'));
  await configure(new Date(Date.now() + 30_000).toISOString(), officialRubric);
  await Promise.all(
    Array.from({ length: 11 }, async (_, i) => {
      const t = await requireTeam(await addTeam('Fixture ' + i));
      await saveSubmission(t.id, 'Fixture ' + i, 'tax-B', {
        bytes: Buffer.from('fixture-' + i),
        filename: 'result.md',
        source: 'upload',
        hash: 'test',
      });
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  await db()`UPDATE submissions SET submitted_at=submitted_at-interval '12 minutes'`;
  await configure(new Date(Date.now() - 601000).toISOString(), officialRubric);
  const ids = await freezeBatch();
  fake.now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(
    () => virtualTime.getStore()?.now ?? fake.now,
  );
  await Promise.all(
    [...ids, ...ids].map((id) =>
      virtualTime.run({ now: fake.now }, () => judgeSubmission(id)),
    ),
  );
  const result = await desk();
  expect(fake.boxes.size).toBe(11);
  expect([...fake.boxes.values()].every((b) => b.closed)).toBe(true);
  for (const t of result.teams) {
    expect(t.phase, t.issue ?? 'run finished').toBe('complete');
    expect(t.points).toBe(25);
    expect(t.scorecard?.rows.length).toBe(4);
    const obs =
      await db()`SELECT output FROM observations WHERE run_id=${t.run_id} AND ref='V01-1'`;
    expect(obs[0].output).toBe('exit 0\nfixture-' + t.name.split(' ')[1]);
  }
}, 30_000);
