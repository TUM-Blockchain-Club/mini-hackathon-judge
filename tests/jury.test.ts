import test from 'node:test';
import assert from 'node:assert/strict';
import { standings } from '../lib/standings';
import type { TeamRow } from '../lib/types';
import {
  officialCriteria,
  officialPoints,
  validateOfficial,
  type OfficialCard,
} from '../judge/official';

const refs = new Set(['obs']);
const evidence = [{ ref: 'obs', location: 'matrix.csv row 1' }];
function report(): OfficialCard {
  return {
    rows: officialCriteria.map((c) => ({
      id: c.id,
      points: c.max / 2,
      reason: 'Half credit',
      evidence,
    })),
    checks: [
      {
        id: 'R0-1',
        checked: 'Read matrix',
        result: 'Claim cited',
        label: 'claimed only',
        credit: 'half',
        effect: 'S1 partial',
        violation: false,
        evidence,
      },
    ],
    efficiencyApplicable: true,
    juryQuestions: ['Can the jury reproduce one value?'],
  };
}
test('official levels, requirement evidence, violations and optional efficiency', () => {
  const c = report();
  assert.equal(validateOfficial(c, ['R0-1'], refs), 25);
  assert.throws(() => validateOfficial(c, ['R0-1', 'R0-2'], refs));
  assert.throws(() => validateOfficial(c, ['R0-1'], new Set(['wrong ref'])));
  c.checks[0].violation = true;
  assert.throws(() => validateOfficial(c, ['R0-1'], refs));
  c.checks[0].credit = 'none';
  assert.equal(validateOfficial(c, ['R0-1'], refs), 25);
  c.checks[0].violation = false;
  c.checks[0].credit = 'full';
  assert.throws(() => validateOfficial(c, ['R0-1'], refs));
  c.checks[0].label = 'contradicted';
  assert.throws(() => validateOfficial(c, ['R0-1'], refs));
  c.checks[0].credit = 'none';
  c.rows[0].points = 15;
  assert.throws(() => validateOfficial(c, ['R0-1'], refs));
  c.rows[0].points = 10;
  c.efficiencyApplicable = false;
  assert.throws(() => validateOfficial(c, ['R0-1'], refs));
  c.rows[3].points = 0;
  assert.equal(validateOfficial(c, ['R0-1'], refs), 25);
  for (const [i, r] of c.rows.entries())
    r.points = i === 3 ? 0 : officialCriteria[i].max;
  assert.equal(officialPoints(c, false), 50);
});
function team(
  id: string,
  points: number,
  pitchSum: number,
  ballots = 3,
  late = false,
): TeamRow {
  return {
    id,
    name: id,
    points,
    ballots,
    pitch_sum: pitchSum,
    pitch: null,
    legacy_pitch: null,
    late,
    run_id: id,
    my_ballot: null,
    submission: id,
    title: id,
    focus: 'tax-A',
    digest: null,
    source: null,
    filename: null,
    submitted_at: null,
    phase: 'complete',
    issue: null,
    rubric: null,
    scorecard: null,
    jury_review: null,
    history: [],
  };
}
test('three ballots, one late deduction and auditable podium decisions', () => {
  const data = [
    team('a', 40, 120),
    team('b', 45, 105),
    team('c', 45, 120, 3, true),
    team('d', 50, 150, 2),
    team('e', 0, 0, 3, true),
  ];
  let rows = standings(data, []);
  assert.equal(rows.find((t) => t.id === 'd')?.overall, null);
  assert.equal(rows.find((t) => t.id === 'e')?.overall, 0);
  assert.equal(rows[0].overall, 80);
  assert.equal(rows[1].overall, 80);
  assert.equal(rows[0].place, null);
  assert.equal(rows[1].tie, rows[0].tie);
  assert.equal(rows.find((t) => t.id === 'b')?.place, 3);
  const decision = {
    signature: rows[0].tie!,
    team_order: ['c', 'a'],
    reason: 'Jury decision',
  };
  rows = standings(data, [decision]);
  assert.deepEqual(
    rows.slice(0, 3).map((t) => [t.id, t.place]),
    [
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ],
  );
  data[0].pitch_sum--;
  assert.equal(
    standings(data, [decision]).some((r) => r.decision),
    false,
  );
  const fraction = standings(
    [team('x', 100 / 3, 100), team('y', 100 / 3 + 10, 70)],
    [],
  );
  assert.equal(fraction[0].total, fraction[1].total);
  assert.equal(fraction[0].id, 'x');
  assert.equal(fraction[0].place, 1);
});
