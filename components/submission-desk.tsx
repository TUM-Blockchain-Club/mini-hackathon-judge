'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoginForm, RosterForm, problem, send } from './registration/forms';
import { TeamDirectory } from './registration/team-directory';
import { Submission } from './submission';
import { eventDate } from '@/lib/event';

type Desk = {
  state: 'open' | 'late' | 'closed' | 'pending' | 'unavailable';
  deadline?: string;
  closes?: string;
  team: { id: string; name: string } | null;
};
type Access = 'login' | 'signup' | 'code';

export function SubmissionDesk() {
  const [desk, setDesk] = useState<Desk | null>(null),
    [access, setAccess] = useState<Access>('login'),
    [error, setError] = useState(''),
    [signingOut, setSigningOut] = useState(false),
    [directoryFor, setDirectoryFor] = useState<string | null>(null),
    [reset, setReset] = useState(0);
  const sequence = useRef(0);
  const previousTeam = useRef<string | undefined>(undefined);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const info = await send<Desk>('/api/submissions', 'GET');
      if (request === sequence.current) {
        if (previousTeam.current && previousTeam.current !== info.team?.id) {
          setReset((n) => n + 1);
          setDirectoryFor(null);
        }
        previousTeam.current = info.team?.id;
        setDesk(info);
        setError('');
      }
    } catch (err) {
      if (request === sequence.current) {
        setError(problem(err));
        setDesk(null);
      }
    }
  }, []);
  useEffect(() => {
    function readAccess() {
      switch (window.location.hash) {
        case '#signup':
          setAccess('signup');
          break;
        case '#access-code':
          setAccess('code');
          break;
        default:
          setAccess('login');
      }
    }
    readAccess();
    window.addEventListener('hashchange', readAccess);
    return () => window.removeEventListener('hashchange', readAccess);
  }, []);
  useEffect(() => {
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      sequence.current++;
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);
  useEffect(() => {
    const next =
      desk?.state === 'open'
        ? desk.deadline
        : desk?.state === 'late'
          ? desk.closes
          : undefined;
    if (!next) return;
    const ms = Math.min(
      2_147_000_000,
      Math.max(1000, Date.parse(next) - Date.now() + 500),
    );
    const timer = setTimeout(refresh, ms);
    return () => clearTimeout(timer);
  }, [desk, refresh]);
  async function identified() {
    await refresh();
    if (window.location.pathname === '/submit' && window.location.hash) {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      );
    }
    setAccess('login');
  }
  async function logout() {
    setSigningOut(true);
    try {
      await send('/api/team/logout', 'POST');
      previousTeam.current = undefined;
      setDirectoryFor(null);
      setReset((n) => n + 1);
      await identified();
    } catch (err) {
      setError(problem(err));
    } finally {
      setSigningOut(false);
    }
  }
  const team = desk?.team;
  return (
    <section className="reg-card submission-card">
      {desk?.deadline && (
        <p className="submission-deadline">
          Submission deadline <strong>{eventDate(desk.deadline)}</strong>
          {desk.closes && (
            <>
              {' '}
              · Late entries through {eventDate(desk.closes)} incur a 5-point
              deduction.
            </>
          )}
        </p>
      )}
      <div className="submission-team">
        {team ? (
          <>
            <strong>{team.name}</strong>
            <div className="submission-access-actions">
              <button
                type="button"
                className="submission-action"
                aria-expanded={directoryFor === team.id}
                onClick={() =>
                  setDirectoryFor(directoryFor === team.id ? null : team.id)
                }
              >
                Other teams
              </button>
              <button
                type="button"
                className="submission-action"
                onClick={logout}
                disabled={signingOut}
              >
                Log out
              </button>
            </div>
          </>
        ) : desk ? (
          <nav aria-label="Team account" className="team-account-nav">
            <a
              href="#login"
              aria-current={access === 'login' ? 'location' : undefined}
            >
              Team login
            </a>
            <a
              href="#signup"
              aria-current={access === 'signup' ? 'location' : undefined}
            >
              Sign up a team
            </a>
            <a
              href="#access-code"
              aria-current={access === 'code' ? 'location' : undefined}
            >
              Use access code
            </a>
          </nav>
        ) : (
          <span role="status">
            {error ? 'Team access unavailable' : 'Loading team access…'}
          </span>
        )}
      </div>
      {team && directoryFor === team.id && <TeamDirectory key={team.id} />}
      {desk && !team && access === 'login' && (
        <LoginForm onSuccess={identified} />
      )}
      {desk && !team && access === 'signup' && (
        <section className="submission-auth-form" id="signup">
          <h2>Register your team</h2>
          <p className="reg-intro">
            Register one to three members. Everyone signs in with the same team
            name and password.
          </p>
          <RosterForm mode="signup" onSaved={identified} />
        </section>
      )}
      {error && (
        <p className="reg-error" role="alert">
          {error}{' '}
          <button type="button" className="submission-action" onClick={refresh}>
            Retry
          </button>
        </p>
      )}
      <Submission
        key={reset}
        state={desk?.state ?? 'loading'}
        teamId={desk?.team?.id}
        useCode={access === 'code' && !desk?.team}
        refresh={refresh}
      />
    </section>
  );
}
