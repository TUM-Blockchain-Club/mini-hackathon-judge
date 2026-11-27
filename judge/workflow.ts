import { getWorkflowMetadata, sleep } from 'workflow';
import {
  claim,
  prepare,
  inspectRound,
  finalize,
  markReview,
  release,
} from './steps';

export async function judgeSubmission(id: string) {
  'use workflow';
  const { workflowRunId } = getWorkflowMetadata();
  const run = await claim(id, workflowRunId);
  if (!run) return;
  try {
    await prepare(run);
    // Each turn has the same tool-call and output limits. Later turns can see the evidence already saved.
    for (let turn = 1; turn <= 20 && Date.now() < run.until - 325_000; turn++) {
      const done = await inspectRound(run, turn, 'inspect');
      if (done && Date.now() >= run.until - 390_000) break;
    }
    const crosscheckAt = run.until - 300_000;
    if (Date.now() < crosscheckAt) await sleep(new Date(crosscheckAt));
    for (let turn = 1; turn <= 5 && Date.now() < run.until - 100_000; turn++) {
      const done = await inspectRound(run, turn, 'crosscheck');
      if (done) break;
    }
    await finalize(run);
  } catch (err) {
    await markReview(
      run,
      err instanceof Error ? err.message : 'Judge service interrupted.',
    );
  } finally {
    await release(run);
  }
}
