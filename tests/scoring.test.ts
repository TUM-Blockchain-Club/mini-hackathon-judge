import test from 'node:test';
import assert from 'node:assert/strict';
import { draftRubric, rubricSchema, scoreCard } from '../judge/rubric';
import { capture } from '../lib/artifacts';

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
test('accepts only public GitHub repository submissions', async (t) => {
  const form = new FormData();
  for (const url of ['https://example.com/a/b', 'https://github.com/../b', 'https://github.com/a/b/tree/main']) {
    form.set('repository', url);
    await assert.rejects(capture(form), /repository link/);
  }
  form.set('repository', 'https://github.com/example/project');
  form.set('file', new File(['example'], 'proof.txt'));
  await assert.rejects(capture(form), /repository link/);
  form.delete('file');
  const download = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  await assert.rejects(capture(form), /public/);
  download.mock.mockImplementation(async () => new Response('invalid archive'));
  await assert.rejects(capture(form), /archive/);
});
