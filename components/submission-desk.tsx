'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoginForm, RosterForm, problem, send } from './registration/forms';
import { Submission } from './submission';
import { eventDate } from '@/lib/event';

type Desk = {
  state: 'open' | 'late' | 'closed' | 'pending' | 'unavailable';
  deadline?: string;
  closes?: string;
  team: { id: string; name: string } | null;
};
type Access = 'idle' | 'login' | 'signup' | 'code';

export function SubmissionDesk() {
  const [desk, setDesk] = useState<Desk | null>(null),
    [access, setAccess] = useState<Access>('idle'),
    [error, setError] = useState(''),
    [signingOut, setSigningOut] = useState(false),
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
          setAccess('idle');
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
    setAccess('idle');
    await refresh();
  }
  async function logout() {
    setSigningOut(true);
    try {
      await send('/api/team/logout', 'POST');
      previousTeam.current = undefined;
      setReset((n) => n + 1);
      await identified();
    } catch (err) {
      setError(problem(err));
    } finally {
      setSigningOut(false);
    }
  }
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
        {desk?.team ? (
          <>
            <strong>{desk.team.name}</strong>
            <button
              type="button"
              className="submission-action"
              onClick={logout}
              disabled={signingOut}
            >
              Log out
            </button>
          </>
        ) : desk ? (
          <>
            <span>Team access</span>
            <div className="submission-access-actions">
              <button
                type="button"
                className="submission-action"
                aria-expanded={access === 'login'}
                onClick={() => setAccess(access === 'login' ? 'idle' : 'login')}
              >
                Team login
              </button>
              <button
                type="button"
                className="submission-action"
                aria-expanded={access === 'signup'}
                onClick={() =>
                  setAccess(access === 'signup' ? 'idle' : 'signup')
                }
              >
                Register a team
              </button>
              <button
                type="button"
                className="submission-action"
                aria-expanded={access === 'code'}
                onClick={() => setAccess(access === 'code' ? 'idle' : 'code')}
              >
                Use access code
              </button>
            </div>
          </>
        ) : (
          <span role="status">
            {error ? 'Team access unavailable' : 'Loading team access…'}
          </span>
        )}
      </div>
      {!desk?.team && access === 'login' && (
        <LoginForm onSuccess={identified} />
      )}
      {!desk?.team && access === 'signup' && (
        <section className="submission-auth-form">
          <h2>Register your team</h2>
          <p className="reg-intro">Add one to three members.</p>
          <RosterForm
            mode="signup"
            onSaved={identified}
            onCancel={() => setAccess('idle')}
          />
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
