'use client';
import { useState } from 'react';
import type { desk } from '@/lib/store';
import { focusLabel, pitchCriteria } from '@/lib/event';

type Desk = Pick<Awaited<ReturnType<typeof desk>>, 'teams' | 'rubric'>;
const views = ['Standings', 'Submission criteria', 'Pitch criteria'] as const;
const format = (n: number | null | undefined) =>
  n == null
    ? 'Pending'
    : n.toLocaleString('en-GB', { maximumFractionDigits: 2 });

export function ProjectOverview({ data }: { data: Desk }) {
  const [view, setView] = useState<(typeof views)[number]>('Standings');
  const standings = view === 'Standings';
  const showSubmission = view !== 'Pitch criteria';
  const showPitch = view !== 'Submission criteria';
  const projects = data.teams.filter((t) => t.submission);
  const awaiting = data.teams.filter((t) => !t.submission);
  const metrics = [
    [
      'Projects submitted',
      projects.length,
      `of ${data.teams.length} registered teams`,
    ],
    [
      'Submission scores',
      projects.filter((t) => t.points != null).length,
      'projects scored',
    ],
    [
      'Pitch ballots',
      projects.reduce((n, t) => n + t.ballots, 0),
      `of ${projects.length * 3} expected`,
    ],
    [
      'Overall scores',
      projects.filter((t) => t.overall != null).length,
      'projects with both scores',
    ],
  ] as const;
  function criteria(t: Desk['teams'][number]) {
    return (
      t.rubric?.criteria ?? [
        ...data.rubric.common,
        ...(data.rubric.focuses[t.focus ?? ''] ?? []),
      ]
    );
  }
  return (
    <>
      <dl className="desk-metrics">
        {metrics.map(([label, value, hint]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
            <dd>{hint}</dd>
          </div>
        ))}
      </dl>
      <section className="reg-card desk-overview">
        <h2>Submitted projects</h2>
        {projects.length > 0 ? (
          <>
            <div
              className="desk-views"
              role="group"
              aria-label="Compare projects by"
            >
              {views.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <table className="desk-comparison" aria-label={view}>
              <thead>
                <tr>
                  <th scope="col">Project / team</th>
                  {showSubmission && <th scope="col">Submission</th>}
                  {showPitch && <th scope="col">Pitch · jury average</th>}
                </tr>
              </thead>
              <tbody>
                {projects.map((t) => (
                  <tr key={t.id}>
                    <th scope="row">
                      <a href={'#project-' + t.id}>{t.title || t.name}</a>
                      <small>
                        {t.name}
                        {t.focus && ' · ' + focusLabel(t.focus, t.own_topic)}
                      </small>
                      {standings && (
                        <p className="desk-result">
                          {t.place != null && <small>Place {t.place}</small>}
                          {t.tie && !t.decision && <small>Podium tie</small>}
                          <strong>
                            {t.jury_review?.disqualified
                              ? 'Disqualified'
                              : t.overall == null
                                ? 'Overall pending'
                                : format(t.overall) + '/100'}
                          </strong>
                          {t.late && <small>Late deduction −5</small>}
                        </p>
                      )}
                    </th>
                    {showSubmission && (
                      <td>
                        <strong className="desk-score">
                          <span>Submission</span>{' '}
                          {t.points == null
                            ? 'Pending'
                            : format(t.points) + '/50'}
                        </strong>
                        {t.phase === 'review' && <small>Needs review</small>}
                        <dl>
                          {criteria(t).map((c) => {
                            const exempt =
                              c.id === 'S4' &&
                              t.scorecard &&
                              'efficiencyApplicable' in t.scorecard &&
                              !t.scorecard.efficiencyApplicable;
                            const adjusted = c.id === 'S1' && t.jury_review;
                            const points = adjusted
                              ? adjusted.correctness
                              : t.scorecard?.rows.find((r) => r.id === c.id)
                                  ?.points;
                            return (
                              <div key={c.id}>
                                <dt>
                                  {c.title}
                                  {adjusted && <small>Jury reviewed</small>}
                                </dt>
                                <dd>
                                  {exempt
                                    ? 'Exempt'
                                    : points == null
                                      ? 'Pending'
                                      : format(points) + '/' + c.max}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      </td>
                    )}
                    {showPitch && (
                      <td>
                        <strong className="desk-score">
                          <span>Pitch</span>{' '}
                          {t.pitch == null
                            ? 'Pending'
                            : format(t.pitch) + '/50'}
                        </strong>
                        <small>{t.ballots}/3 ballots</small>
                        {t.pitch_means ? (
                          <dl>
                            {pitchCriteria.map((c) => (
                              <div key={c.id}>
                                <dt>{c.label}</dt>
                                <dd>
                                  {format(t.pitch_means![c.id])}/{c.max}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          t.pitch != null && (
                            <small>Criterion scores unavailable</small>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {view === 'Pitch criteria' && (
              <p className="desk-note">
                Each criterion shows the average once all three jurors have
                voted.
              </p>
            )}
            {view === 'Submission criteria' && (
              <p className="desk-note">
                Points use each project’s rubric. When efficiency is exempt, the
                remaining 45 points scale to 50.
              </p>
            )}
          </>
        ) : (
          <p className="desk-note">No projects submitted yet.</p>
        )}
        {awaiting.length > 0 && (
          <details className="desk-awaiting">
            <summary>Awaiting submission ({awaiting.length})</summary>
            <ul>
              {awaiting.map((t) => (
                <li key={t.id}>{t.name}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </>
  );
}
