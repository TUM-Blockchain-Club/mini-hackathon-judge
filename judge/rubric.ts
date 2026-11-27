import { z } from 'zod';
import { focuses } from '../lib/event';

const criterion = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,48}$/),
    title: z.string().trim().min(1).max(160),
    max: z.number().int().min(1).max(50),
    guidance: z.string().trim().min(1).max(1800),
  })
  .strict();
export const rubricSchema = z
  .object({
    version: z.string().trim().min(1).max(80),
    common: z.array(criterion).max(12),
    focuses: z.record(z.string(), z.array(criterion).max(12)),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (Object.keys(r.focuses).some((k) => !Object.hasOwn(focuses, k)))
      ctx.addIssue({ code: 'custom', message: 'Unknown focus.' });
    for (const key of Object.keys(focuses)) {
      if (key.endsWith('-own') && !Object.hasOwn(r.focuses, key)) continue;
      const rules = [...r.common, ...(r.focuses[key] ?? [])];
      if (
        !Object.hasOwn(r.focuses, key) ||
        rules.reduce((n, x) => n + x.max, 0) !== 50 ||
        new Set(rules.map((x) => x.id)).size !== rules.length
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `${key} needs distinct criteria worth exactly 50 points.`,
        });
      }
    }
  });
export type Rubric = z.infer<typeof rubricSchema>;
export type Criterion = z.infer<typeof criterion>;
export const draftRubric: Rubric = {
  version: 'rehearsal-1',
  common: [
    {
      id: 'evidence',
      title: 'Evidence and sources',
      max: 15,
      guidance:
        'Award 5 points each for dated evidence, traceable sources and an explicit distinction between observations and estimates.',
    },
    {
      id: 'repeat',
      title: 'Reproducibility',
      max: 10,
      guidance:
        'Award 5 points for executable instructions or worked steps and 5 for a documented independent reproduction.',
    },
    {
      id: 'weights',
      title: 'Scoring weights',
      max: 10,
      guidance:
        'Award 5 points for a beginner-focused rationale and 5 for a reconciled 100-point matrix or the wallet focus’s proposed criteria weights.',
    },
  ],
  focuses: Object.fromEntries(
    Object.entries(focuses).map(([key, label]) => [
      key,
      [
        {
          id: 'focus',
          title: label,
          max: 15,
          guidance: `Assess the agreed ${label} deliverable. Award 5 points each for a defined method, a worked application and documented limitations.`,
        },
      ],
    ]),
  ),
};
export const rowSchema = z.object({
  id: z.string(),
  points: z.number().nonnegative(),
  reason: z.string().trim().min(1).max(1600),
  evidence: z
    .array(
      z.object({
        ref: z.string(),
        location: z.string().trim().min(1).max(240),
      }),
    )
    .min(1)
    .max(6),
});
export const cardSchema = z.object({ rows: z.array(rowSchema).min(1).max(24) });
export type Card = z.infer<typeof cardSchema>;
export function scoreCard(
  criteria: Criterion[],
  card: Card,
  refs: Set<string>,
  fractional = false,
) {
  cardSchema.parse(card);
  if (
    card.rows.length !== criteria.length ||
    new Set(card.rows.map((r) => r.id)).size !== criteria.length
  )
    throw Error('Expected one score for each criterion.');
  let points = 0;
  for (const c of criteria) {
    const r = card.rows.find((r) => r.id === c.id);
    if (
      !r ||
      (!fractional && !Number.isInteger(r.points)) ||
      r.points > c.max ||
      r.evidence.some((e) => !refs.has(e.ref))
    )
      throw Error(`Invalid points or evidence for ${c.id}.`);
    points += r.points;
  }
  return points;
}
