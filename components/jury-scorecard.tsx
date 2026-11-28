import { focusLabel } from '@/lib/event';
import type { TeamRow } from '@/lib/types';
export function JuryScorecard({
  team: t,
  canReview,
  busy,
  onReview,
}: {
  team: TeamRow;
  canReview: boolean;
  busy: boolean;
  onReview: (data: unknown) => void;
}) {
  const card = t.scorecard;
  if (!card) return null;
  return (
    <details>
      <summary>AI scorecard · {t.rubric?.version}</summary>
      <p>
        {t.focus && focusLabel(t.focus, t.own_topic)} · {t.source} · SHA-256{' '}
        <code>{t.digest}</code>
        {t.guide_revision && (
          <>
            {' '}
            · Guide{' '}
            <code title={t.guide_revision}>
              {t.guide_revision.slice(0, 12)}
            </code>
          </>
        )}
      </p>
      {'checks' in card && (
        <>
          <h4>Requirement checks</h4>
          {card.checks.map((c) => (
            <div key={c.id}>
              <b>
                {c.id} · {c.label} · {c.credit} credit
              </b>
              <p>
                {c.checked} · {c.result}
              </p>
              <p>{c.effect}</p>
              {c.violation && <b>Rule violation · jury review required</b>}
              {c.evidence.map((e, i) => (
                <small key={i}>
                  {e.ref} · {e.location}{' '}
                </small>
              ))}
            </div>
          ))}
          <p>
            Efficiency{' '}
            {card.efficiencyApplicable
              ? 'applicable'
              : 'excluded · S1–S3 scaled from 45 to 50'}
          </p>
        </>
      )}
      <div className="results">
        {card.rows.map((row) => {
          const c = t.rubric?.criteria.find((x) => x.id === row.id);
          return (
            <div key={row.id}>
              <b>
                {c?.title} · {row.points}/{c?.max}
              </b>
              <p>{row.reason}</p>
              {row.evidence.map((e, i) => (
                <small key={i}>
                  {e.ref} · {e.location}
                </small>
              ))}
            </div>
          );
        })}
      </div>
      {'checks' in card && (
        <>
          {t.history.length > 0 && (
            <>
              <h4>Jury observations</h4>
              <ul>
                {t.history.map((r, i) => (
                  <li key={i}>
                    {r.requirement} · {r.label} · {r.note} · S1 {r.correctness}
                    /20
                  </li>
                ))}
              </ul>
            </>
          )}
          <h4>Questions for the jury</h4>
          <ul>
            {card.juryQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
          {canReview && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                onReview({
                  run: t.run_id,
                  requirement: f.get('requirement'),
                  label: f.get('label'),
                  correctness: Number(f.get('correctness')),
                  note: f.get('note'),
                  disqualified: f.has('dq'),
                });
              }}
            >
              <h4>Record the jury’s decision</h4>
              <label>
                Requirement
                <select
                  name="requirement"
                  defaultValue={t.jury_review?.requirement}
                >
                  {card.checks.map((c) => (
                    <option key={c.id}>{c.id}</option>
                  ))}
                </select>
              </label>
              <label>
                Demo outcome
                <select name="label" defaultValue={t.jury_review?.label}>
                  {['observed in demo', 'contradicted', 'unverified'].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Reviewed correctness
                <select
                  name="correctness"
                  defaultValue={
                    t.jury_review?.correctness ??
                    card.rows.find((r) => r.id === 'S1')?.points
                  }
                >
                  {[0, 10, 20].map((n) => (
                    <option key={n} value={n}>
                      {n}/20
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Jury observation and rationale
                <textarea
                  name="note"
                  required
                  maxLength={1500}
                  defaultValue={t.jury_review?.note}
                />
              </label>
              <label>
                <span>
                  <input
                    type="checkbox"
                    name="dq"
                    defaultChecked={t.jury_review?.disqualified}
                  />{' '}
                  Disqualify for a serious violation
                </span>
              </label>
              <button className="button" disabled={!!busy}>
                Record decision
              </button>
            </form>
          )}
        </>
      )}
    </details>
  );
}
