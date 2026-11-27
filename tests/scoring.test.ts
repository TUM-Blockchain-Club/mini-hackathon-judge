import test from 'node:test';
import assert from 'node:assert/strict';
import { draftRubric, rubricSchema, scoreCard } from '../judge/rubric';
import { digest, inspectFile, capture } from '../lib/artifacts';

test('the nine focuses and three own-topic options share the 50-point scale and reject duplicate criteria', () => {
  const r = rubricSchema.parse(draftRubric);
  assert.equal(Object.keys(r.focuses).length, 12);
  const bad = structuredClone(r);
  bad.common[1].id = bad.common[0].id;
  assert.equal(rubricSchema.safeParse(bad).success, false);
  delete bad.focuses['tax-A'];
  assert.equal(rubricSchema.safeParse(bad).success, false);
});
test('scores are computed only from complete bounded rows with recorded evidence', () => {
  const criteria = [...draftRubric.common, ...draftRubric.focuses['tax-A']];
  const rows = criteria.map((c) => ({
    id: c.id,
    points: c.max - 1,
    reason: 'Partial match',
    evidence: [{ ref: 'r1', location: 'results.csv line 4' }],
  }));
  const refs = new Set(['r1']);
  assert.equal(scoreCard(criteria, { rows }, refs), 46);
  assert.throws(() => scoreCard(criteria, { rows: rows.slice(1) }, refs));
  assert.throws(() =>
    scoreCard(criteria, { rows: [rows[0], ...rows.slice(0, 3)] }, refs),
  );
  assert.throws(() =>
    scoreCard(
      criteria,
      { rows: [{ ...rows[0], points: 51 }, ...rows.slice(1)] },
      refs,
    ),
  );
  assert.throws(() => scoreCard(criteria, { rows }, new Set()));
});
test('uploads capture the exact bytes and reject unsupported or malformed inputs', async () => {
  const bytes = Buffer.from('example evidence\n');
  const f = new FormData();
  f.set('method', 'file');
  f.set('file', new File([bytes], 'evidence.csv'));
  const result = await capture(f);
  assert.equal(result.hash, digest(bytes));
  assert.deepEqual(result.bytes, bytes);
  await assert.rejects(inspectFile('../data.md', bytes));
  await assert.rejects(inspectFile('result.pdf', bytes));
  await assert.rejects(inspectFile('data.zip', bytes));
  await assert.rejects(inspectFile('run.exe', bytes));
  f.set('method', 'github');
  f.set('commit', 'https://github.com/a/b/tree/main');
  await assert.rejects(capture(f));
});
