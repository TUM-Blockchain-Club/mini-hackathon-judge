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
  const key = (c: { id: string; title: string; max: number }) =>
    JSON.stringify([c.id, c.title, c.max]);
  const columns = Array.from(
    new Map(
      projects.flatMap((t) => criteria(t).map((c) => [key(c), c] as const)),
    ).values(),
  );
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
            <div
              className="desk-scroll"
              tabIndex={0}
              role="region"
              aria-label={view + ' comparison'}
            >
              <table aria-label={view}>
                <thead>
                  <tr>
                    <th scope="col">Project / team</th>
                    {view === 'Standings'
                      ? [
                          'Place',
                          'Submission /50',
                          'Pitch /50',
                          'Late deduction',
                          'Overall /100',
                        ].map((label) => (
                          <th key={label} scope="col">
                            {label}
                          </th>
                        ))
                      : view === 'Pitch criteria'
                        ? pitchCriteria.map((c) => (
                            <th key={c.id} scope="col">
                              {c.label} /{c.max}
                            </th>
                          ))
                        : columns.map((c) => (
                            <th key={key(c)} scope="col">
                              {c.title} /{c.max}
                            </th>
                          ))}
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
                      </th>
                      {view === 'Standings' ? (
                        <>
                          <td>{t.place ?? (t.tie ? 'Tied' : '—')}</td>
                          <td>
                            {format(t.points)}
                            {t.phase === 'review' && (
                              <small>Needs review</small>
                            )}
                          </td>
                          <td>
                            {format(t.pitch)}
                            <small>{t.ballots}/3 ballots</small>
                          </td>
                          <td>{t.late ? '−5' : '0'}</td>
                          <td>
                            <strong>
                              {t.jury_review?.disqualified
                                ? 'Disqualified'
                                : format(t.overall)}
                            </strong>
                          </td>
                        </>
                      ) : view === 'Pitch criteria' ? (
                        pitchCriteria.map((c) => (
                          <td key={c.id}>
                            {t.pitch_means
                              ? format(t.pitch_means[c.id])
                              : t.pitch != null
                                ? 'Unavailable'
                                : 'Pending'}
                          </td>
                        ))
                      ) : (
                        columns.map((c) => {
                          const applies = criteria(t).some(
                            (x) => key(x) === key(c),
                          );
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
                            <td key={key(c)}>
                              {!applies
                                ? '—'
                                : exempt
                                  ? 'Exempt'
                                  : format(points)}
                              {applies && adjusted && (
                                <small>Jury reviewed</small>
                              )}
                            </td>
                          );
                        })
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
