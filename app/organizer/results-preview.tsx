import { ProjectOverview } from '@/components/project-overview';
import { standings } from '@/lib/standings';
import type { TeamRow } from '@/lib/types';
import {
  officialCriteria,
  officialPoints,
  officialRubric,
} from '@/judge/official';

type Sample = {
  name: string;
  title: string;
  focus: string;
  scores: [number, number, number, number];
  reasons: [string, string, string, string];
  pitch: NonNullable<TeamRow['pitch_means']> | null;
  late?: boolean;
};

const samples: Sample[] = [
  {
    name: 'Northstar',
    title: 'Exchange fee replay',
    focus: 'exchange-A',
    scores: [20, 10, 15, 2.5],
    pitch: { p1: 14, p2: 13, p3: 9, p4: 8 },
    reasons: [
      'All five receipts matched the calculated fees.',
      'The fee table shows where a €10 purchase costs least.',
      'A second reviewer reproduced all five comparisons from the supplied receipts.',
      'The team estimated the time saved but did not time a manual run.',
    ],
  },
  {
    name: 'Paper Lantern',
    title: 'Wallet recovery walkthrough',
    focus: 'wallet-B',
    scores: [10, 10, 7.5, 5],
    pitch: { p1: 12, p2: 13, p3: 7, p4: 9 },
    late: true,
    reasons: [
      'Two recovery flows reproduced. The third lacked a verification step.',
      'A first-time user can follow the checklist for each wallet.',
      'The log includes screenshots for two of three wallets.',
      'Timed trials measured the revised checklist against the original.',
    ],
  },
  {
    name: 'Copper Finch',
    title: 'Tax import cross-check',
    focus: 'tax-B',
    scores: [20, 5, 15, 0],
    pitch: null,
    reasons: [
      'The calculated totals matched the sample transactions.',
      'The comparison identifies import errors but gives no correction steps.',
      'The fixtures and import log reproduce the reported differences.',
      'The team supplied no evidence of time savings.',
    ],
  },
];

function previewTeam(sample: Sample): TeamRow {
  const rows = officialCriteria.map((c, i) => ({
    id: c.id,
    points: sample.scores[i],
    reason: sample.reasons[i],
    evidence: [{ ref: 'Example ' + (i + 1), location: sample.title }],
  }));
  return {
    id: sample.focus,
    name: sample.name,
    title: sample.title,
    focus: sample.focus,
    own_topic: null,
    submission: sample.focus,
    run_id: sample.focus,
    phase: 'complete',
    points: officialPoints({ rows }, true),
    scorecard: { rows },
    rubric: { version: officialRubric.version, criteria: officialCriteria },
    pitch: null,
    ballots: sample.pitch ? 3 : 0,
    pitch_means: sample.pitch,
    pitch_sum: sample.pitch
      ? Object.values(sample.pitch).reduce((sum, n) => sum + n, 0) * 3
      : 0,
    late: !!sample.late,
    my_ballot: null,
    legacy_pitch: null,
    jury_review: null,
    history: [],
    digest: null,
    source: null,
    filename: null,
    submitted_at: null,
    issue: null,
  };
}

export function ResultsPreview() {
  const teams = standings(samples.map(previewTeam), []);
  return (
    <>
      <div className="admin-head">
        <h1>Mock judging results</h1>
        <a className="reg-secondary" href="/organizer">
          Back to live desk
        </a>
      </div>
      <p>Read-only preview with three fictional submissions.</p>
      <ProjectOverview data={{ teams, rubric: officialRubric }} />
      <section className="reg-card setup">
        <h2>Project reviews</h2>
        {teams.map((team) => (
          <article key={team.id} id={'project-' + team.id} className="team-row">
            <h3>{team.title}</h3>
            <p>
              {team.name} · Submission {team.points}/50
            </p>
            <dl>
              {team.scorecard?.rows.map((row, i) => (
                <div key={row.id}>
                  <dt>
                    <strong>
                      {officialCriteria[i].title} · {row.points}/
                      {officialCriteria[i].max}
                    </strong>
                  </dt>
                  <dd>{row.reason}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </section>
    </>
  );
}
