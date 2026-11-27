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
import type { TeamRow } from '@/lib/types';
import { draftRubric, type Rubric } from '@/judge/rubric';
import { eventDate, focuses } from '@/lib/event';
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
type Data = {
  deadline?: string;
  started: boolean;
  rubric: Rubric | null;
  teams: TeamRow[];
};
function localTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(+date - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function Organizer({ data }: { data: Data }) {
  const router = useRouter(),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [deadline, setDeadline] = useState(''),
    [rubric, setRubric] = useState(() =>
      JSON.stringify(data.rubric ?? draftRubric, null, 2),
    );
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
  async function settings(e: FormEvent) {
    e.preventDefault();
    try {
      const config = JSON.parse(rubric);
      await act(
        'settings',
        { rubric: config, deadline: new Date(deadline).toISOString() },
        () => setNotice('Event settings saved.'),
      );
    } catch {
      setError('Check the rubric JSON and deadline.');
    }
  }
  const submitted = data.teams.filter((t) => t.submission).length;
  return (
    <>
      <div className="kicker">EVENT OPERATIONS</div>
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
                !data.rubric ||
                (!data.started &&
                  !!data.deadline &&
                  Date.parse(data.deadline) > Date.now())
              }
              onClick={() =>
                act('judge', {}, (r) =>
                  setNotice(r.queued + ' sessions dispatched.'),
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
      </div>
      <details className="panel setup" open={!data.deadline || undefined}>
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
          <label>
            Versioned rubric (JSON)
            <textarea
              value={rubric}
              spellCheck={false}
              disabled={data.started}
              onChange={(e) => setRubric(e.target.value)}
            />
          </label>
          <small>
            The initial values are a rehearsal rubric. Enter Andi’s approved
            requirements before official judging. Common and focus criteria must
            add up to 50 for each focus.
          </small>
          <button className="button" disabled={!!busy || data.started}>
            Save event settings
          </button>
        </form>
      </details>
      <section className="panel">
        <h2>Submissions &amp; standings</h2>
        {!data.teams.length && (
          <p>Create a team above to issue its access code.</p>
        )}
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
                {t.title} · {focuses[t.focus!]}{' '}
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
                {t.points == null
                  ? 'pending'
                  : t.points + '/50 · ' + t.points * 2 + '%'}
              </strong>
              <span>Pitch {t.pitch == null ? 'pending' : t.pitch + '/50'}</span>
              <strong>
                Overall{' '}
                {t.points == null || t.pitch == null
                  ? 'pending'
                  : t.points + t.pitch + '%'}
              </strong>
            </div>
            <form
              className="pitch"
              onSubmit={(e) => {
                e.preventDefault();
                act(
                  'pitch',
                  {
                    team: t.id,
                    points: Number(new FormData(e.currentTarget).get('pitch')),
                  },
                  () => setNotice('Pitch score saved.'),
                );
              }}
            >
              <label>
                Pitch points
                <input
                  type="number"
                  key={String(t.pitch)}
                  min={0}
                  max={50}
                  step={1}
                  defaultValue={t.pitch ?? ''}
                  name="pitch"
                  required
                />
              </label>
              <button className="button" disabled={!!busy}>
                Save pitch
              </button>
            </form>
            {t.scorecard && (
              <details>
                <summary>Scorecard · {t.rubric?.version}</summary>
                <div className="results">
                  {t.scorecard.rows.map((row) => {
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
              </details>
            )}
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
