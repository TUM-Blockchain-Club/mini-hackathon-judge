import { z } from 'zod';
import {
  cardSchema,
  scoreCard,
  type Card,
  type Criterion,
  type Rubric,
} from './rubric';
import { focuses } from '../lib/event';
export const officialVersion = 'lightup-2026-11-28-v1';
export const officialCriteria: Criterion[] = [
  {
    id: 'S1',
    title: 'Correctness',
    max: 20,
    guidance:
      'Verify key results against independent evidence. Check internal consistency for conceptual work.',
  },
  {
    id: 'S2',
    title: 'Usefulness of the deliverable',
    max: 10,
    guidance:
      'Assess whether LIGHT UP can adopt the deliverable and whether it respects the ground rules.',
  },
  {
    id: 'S3',
    title: 'Evidence and reproducibility',
    max: 15,
    guidance:
      'Assess sources, dates, procedure, peer reproduction and limitations.',
  },
  {
    id: 'S4',
    title: 'Efficiency',
    max: 5,
    guidance:
      'Measured effort earns full credit, a substantiated estimate half. Mark inapplicable only when the topic has no repeatable process.',
  },
];
export const officialRubric: Rubric = {
  version: officialVersion,
  common: officialCriteria,
  focuses: Object.fromEntries(Object.keys(focuses).map((k) => [k, []])),
};
const reading = z.object({
  id: z.string(),
  checked: z.string().min(1).max(600),
  result: z.string().min(1).max(800),
  label: z.enum([
    'independently verified',
    'claimed only',
    'contradicted',
    'unverified',
    'not applicable',
  ]),
  credit: z.enum(['full', 'half', 'none', 'not applicable']),
  effect: z.string().min(1).max(500),
  violation: z.boolean(),
  evidence: z
    .array(z.object({ ref: z.string(), location: z.string().min(1).max(240) }))
    .min(1)
    .max(4),
});
export const officialCardSchema = cardSchema.extend({
  checks: z.array(reading).min(1).max(40),
  efficiencyApplicable: z.boolean(),
  juryQuestions: z.array(z.string().min(1).max(600)).min(1).max(8),
});
export type OfficialCard = z.infer<typeof officialCardSchema>;
export function officialPoints(card: Card, applicable: boolean) {
  const max = applicable ? 50 : 45;
  const raw = officialCriteria.reduce((sum, c) => {
    const row = card.rows.find((r) => r.id === c.id);
    if (
      !row ||
      ![0, c.max / 2, c.max].includes(row.points) ||
      (c.id === 'S4' && !applicable && row.points !== 0)
    )
      throw Error('Invalid credit level for ' + c.id);
    return sum + row.points;
  }, 0);
  return (raw * 50) / max;
}
export function validateOfficial(
  card: OfficialCard,
  ids: string[],
  refs: Set<string>,
) {
  officialCardSchema.parse(card);
  scoreCard(officialCriteria, card, refs, true);
  const found = new Set(card.checks.map((c) => c.id));
  if (
    card.checks.length !== ids.length ||
    found.size !== ids.length ||
    ids.some((id) => !found.has(id))
  )
    throw Error('Incomplete requirement report.');
  for (const c of card.checks) {
    if (
      c.evidence.some((e) => !refs.has(e.ref)) ||
      ((c.violation || c.label === 'contradicted') && c.credit !== 'none') ||
      ((c.label === 'claimed only' || c.label === 'unverified') &&
        c.credit === 'full') ||
      (c.label === 'not applicable') !== (c.credit === 'not applicable')
    )
      throw Error('Invalid requirement assessment for ' + c.id);
  }
  return officialPoints(card, card.efficiencyApplicable);
}
