import type { Card, Criterion } from '../judge/rubric';
export type TeamRow = {
  id: string;
  name: string;
  pitch: number | null;
  submission: string | null;
  title: string | null;
  focus: string | null;
  digest: string | null;
  filename: string | null;
  submitted_at: string | null;
  run_id: string | null;
  phase: string | null;
  points: number | null;
  issue: string | null;
  rubric: { version: string; criteria: Criterion[] } | null;
  scorecard: Card | null;
};
