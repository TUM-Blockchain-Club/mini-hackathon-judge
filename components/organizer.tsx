'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  KeyRound,
  Play,
  RefreshCw,
  LogOut,
  Download,
  LockKeyhole,
} from 'lucide-react';
import { AdminAccounts, type Account } from './admin-accounts';
import { JuryScorecard } from './jury-scorecard';
import type { desk } from '@/lib/store';
import type { Admin } from '@/lib/auth';
import { eventDate, focusLabel, pitchCriteria } from '@/lib/event';
async function post(action: string, body: unknown) {
  const res = await fetch('/api/organizer/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const reply = await res
    .json()
    .catch(() => ({ error: 'Could not reach the organizer service.' }));
  if (!res.ok) throw Error(reply.error);
  return reply;
}
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Request failed.';
export function Login() {
  const router = useRouter(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('login', {
        name: new FormData(e.currentTarget).get('name'),
        password: new FormData(e.currentTarget).get('password'),
      });
      router.refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel login">
      <div className="icon-tile">
        <LockKeyhole />
      </div>
      <h1>
        Organizer desk<span>.</span>
      </h1>
      <p>Sign in to manage teams, judging and pitch scores.</p>
      <form onSubmit={submit}>
        <label>
          Admin name
          <input
            name="name"
            autoComplete="username"
            placeholder="Organizer"
            maxLength={80}
          />
        </label>
        <label>
          Organizer password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          <KeyRound size={16} />
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  );
}
type Data = Awaited<ReturnType<typeof desk>>;

function localTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(+date - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function Organizer({
  data,
  admin,
  accounts,
}: {
  data: Data;
  admin: Admin;
  accounts: Account[];
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [deadline, setDeadline] = useState('');
  useEffect(() => {
    setDeadline(localTime(data.deadline));
  }, [data.deadline]);
  useEffect(() => {
    if (
      !data.started ||
      !data.teams.some(
        (t) => t.run_id && !['complete', 'review'].includes(t.phase ?? ''),
      )
    )
      return;
    const timer = setInterval(() => router.refresh(), 6000);
    return () => clearInterval(timer);
  }, [data, router]);
  async function act(
    action: string,
    body: unknown,
    done?: (r: Record<string, string | number>) => void,
  ) {
    setBusy(action);
    setError('');
    setNotice('');
    try {
      const r = await post(action, body);
      done?.(r);
      router.refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy('');
    }
  }
  function settings(e: FormEvent) {
    e.preventDefault();
    void act('settings', { deadline: new Date(deadline).toISOString() }, () =>
      setNotice('Event settings saved.'),
    );
  }
  function ballot(e: FormEvent<HTMLFormElement>, team: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void act(
      'pitch',
      {
        team,
        ...Object.fromEntries(
          pitchCriteria.map((c) => [c.id, Number(f.get(c.id))]),
        ),
      },
      () => setNotice('Pitch score saved.'),
    );
  }
  async function guide(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = new FormData(e.currentTarget).get('file');
    if (!(file instanceof File) || file.size > 180000) {
      setError('Choose a Markdown guide under 180 KB.');
      return;
    }
    await act('guide', { guide: await file.text() }, () =>
      setNotice('Private guide imported.'),
    );
  }
  const display = (n: number) =>
    n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
  const submitted = data.teams.filter((t) => t.submission).length;
  return (
    <>
      <p className="kicker">
        {admin.name} ·{' '}
        {admin.seat ? 'Juror ' + admin.seat + ' of 3' : 'Event organizer'}
      </p>
      <div className="admin-head">
        <h1>
          Organizer desk<span>.</span>
        </h1>
        <button
          className="button"
          disabled={!!busy}
          onClick={() => act('logout', {})}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="admin-tools">
        <section className="panel">
          <h2>Team registration</h2>
          <p>
            Inspect registered teams, add members and update names in team
            administration.
          </p>
          <a className="button" href="/admin">
            Manage teams
          </a>
        </section>
        {admin.owner && (
          <section className="panel">
            <h2>Judging batch</h2>
            <p>
              {submitted} submitted · {data.teams.length} registered
            </p>
            <p className="subtle">
              {data.deadline
                ? 'Cutoff ' + eventDate(data.deadline)
                : 'Save a deadline and rubric to open submissions.'}
            </p>
            <div className="actions">
              <button
                className="primary"
                disabled={
                  !!busy ||
                  !submitted ||
                  (!data.started &&
                    !!data.deadline &&
                    Date.parse(data.deadline) + 600000 >= Date.now())
                }
                onClick={() =>
                  act('judge', {}, (r) =>
                    setNotice(
                      r.queued
                        ? r.queued +
                            ' Cloud Run sessions dispatched. You can close this page and return for the scorecards.'
                        : 'All sessions have already been dispatched.',
                    ),
                  )
                }
              >
                <Play size={15} />
                {data.started ? 'Resume dispatch' : 'Start judging'}
              </button>
              <button className="button" onClick={() => router.refresh()}>
                <RefreshCw size={15} />
                Refresh
              </button>
            </div>
          </section>
        )}
      </div>
      {data.guideReady && (
        <p>
          <a
            className="text-link"
            href="/api/organizer/guide"
            target="_blank"
            rel="noreferrer"
          >
            Open confidential jury guide
          </a>
        </p>
      )}
      {admin.owner && (
        <>
          <AdminAccounts
            accounts={accounts}
            busy={!!busy}
            act={act}
            setNotice={setNotice}
          />
          <details className="panel setup" open={!data.guideReady || undefined}>
            <summary>Deadline and evaluation rubric</summary>
            <form onSubmit={settings}>
              <label>
                Deadline in your browser’s time zone
                <input
                  type="datetime-local"
                  required
                  value={deadline}
                  disabled={data.started}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </label>
              <small>
                Late entries close ten minutes later and lose five overall
                points.
              </small>
              <button className="button" disabled={!!busy || data.started}>
                Save event settings
              </button>
            </form>
            <form onSubmit={guide}>
              <label>
                Confidential judging guide
                <input
                  required
                  name="file"
                  type="file"
                  accept=".md,text/markdown,text/plain"
                  disabled={data.started}
                />
              </label>
              <small>
                {data.guideReady
                  ? 'A guide is loaded.'
                  : 'Start judging loads the approved guide from private storage. You can also import a revised guide here.'}{' '}
                Starting the batch freezes the guide and each team’s latest
                accepted submission.
              </small>
              <button className="button" disabled={!!busy || data.started}>
                Import guide
              </button>
            </form>
          </details>
        </>
      )}
      <section className="panel">
        <h2>Submissions &amp; standings</h2>
        {!data.teams.length && <p>No teams have registered yet.</p>}
        {data.teams.map((t) => (
          <article className="team-row" key={t.id}>
            <div className="row-head">
              <h3>{t.name}</h3>
              <span className="status">
                <i />
                {t.phase ??
                  (t.submission ? 'Submitted' : 'Awaiting submission')}
              </span>
            </div>
            {t.submission && (
              <p>
                {t.title} · {t.focus && focusLabel(t.focus, t.own_topic)}{' '}
                <a
                  className="text-link"
                  href={'/api/artifacts/' + t.submission}
                >
                  <Download size={14} /> {t.filename}
                </a>
              </p>
            )}
            {t.issue && <p className="alert">{t.issue}</p>}
            <div className="actions">
              <strong>
                Submission{' '}
                {t.points == null ? 'pending' : display(t.points) + '/50'}
              </strong>
              <span>
                Pitch {t.pitch == null ? 'pending' : display(t.pitch) + '/50'} ·{' '}
                {t.ballots}/3 ballots
              </span>
              {t.late && <span>Late −5</span>}
              <strong>
                Overall{' '}
                {t.jury_review?.disqualified
                  ? 'disqualified'
                  : t.overall == null
                    ? 'pending'
                    : display(t.overall) + '%'}
              </strong>
              {t.place != null && <strong>Place {t.place}</strong>}
              {t.tie && !t.decision && (
                <strong>Podium tie · jury decision needed</strong>
              )}
            </div>
            {t.legacy_pitch != null && (
              <small>Previous single-jury score: {t.legacy_pitch}/50</small>
            )}
            {t.decision && <p>Jury tie decision · {t.decision}</p>}
            {t.jury_review && (
              <p className="notice">
                Jury review · {t.jury_review.requirement} ·{' '}
                {t.jury_review.label} · {t.jury_review.note} · S1{' '}
                {t.jury_review.correctness}/20{' '}
                {t.jury_review.disqualified && '· Disqualified'}
              </p>
            )}
            {admin.seat && t.submission && (
              <form onSubmit={(e) => ballot(e, t.id)}>
                <h4>Your pitch ballot</h4>
                <div className="ballot-grid">
                  {pitchCriteria.map((c) => (
                    <label key={c.id}>
                      {c.label} (/{c.max})
                      <input
                        name={c.id}
                        type="number"
                        min="0"
                        max={c.max}
                        step="1"
                        defaultValue={t.my_ballot?.[c.id] ?? ''}
                        required
                      />
                    </label>
                  ))}
                </div>
                <button className="button" disabled={!!busy}>
                  Save pitch
                </button>
              </form>
            )}
            {t.tie &&
              admin.owner &&
              data.teams.find((x) => x.tie === t.tie)?.id === t.id && (
                <details>
                  <summary>Record jury tie decision</summary>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act(
                        'tie',
                        {
                          signature: t.tie,
                          order: f.getAll('team'),
                          reason: f.get('reason'),
                        },
                        () => setNotice('Jury decision saved.'),
                      );
                    }}
                  >
                    {data.teams
                      .filter((x) => x.tie === t.tie)
                      .map((_, i) => (
                        <label key={i}>
                          Tied team in position {i + 1}
                          <select name="team" required defaultValue="">
                            <option value="">Select team</option>
                            {data.teams
                              .filter((x) => x.tie === t.tie)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      ))}
                    <label>
                      Jury rationale
                      <input name="reason" required maxLength={1200} />
                    </label>
                    <button className="button" disabled={!!busy}>
                      Save tie decision
                    </button>
                  </form>
                </details>
              )}
            <JuryScorecard
              team={t}
              canReview={admin.owner}
              busy={!!busy}
              onReview={(body) =>
                void act('review', body, () => setNotice('Jury review saved.'))
              }
            />
            {t.run_id && (
              <a
                className="text-link spaced"
                href={'/api/evidence/' + t.run_id}
                target="_blank"
                rel="noreferrer"
              >
                View evidence log
              </a>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
