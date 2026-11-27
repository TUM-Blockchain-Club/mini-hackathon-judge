'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { LogOut, Plus, UsersRound } from 'lucide-react';
import type { TeamProfile } from '@/lib/registration';
import { LoginForm, RosterForm, problem, send } from './forms';

function Roster({ team }: { team: TeamProfile }) {
  return team.members.length ? (
    <ol className="reg-members">
      {team.members.map((m, i) => (
        <li key={i}>
          <small>Member {i + 1}</small>
          <strong>
            {m.firstName} {m.surname}
          </strong>
        </li>
      ))}
    </ol>
  ) : (
    <p className="reg-intro">
      This team was created with an access code. Edit it to add members and
      enable team login.
    </p>
  );
}
export function TeamAccount() {
  const router = useRouter();
  const [team, setTeam] = useState<TeamProfile | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/team/me', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) return null;
        if (!r.ok) throw new Error('Could not load your team.');
        return await r.json();
      })
      .then((t) => {
        if (active) {
          setTeam(t);
          if (!t) router.replace('/login');
        }
      })
      .catch((e) => {
        if (active) setError(problem(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);
  async function logout() {
    try {
      await send('/api/team/logout', 'POST');
      setTeam(null);
      router.replace('/login');
    } catch (e) {
      setError(problem(e));
    }
  }
  if (loading) return <p role="status">Loading your team…</p>;
  return (
    <>
      {error && (
        <p className="reg-error" role="alert">
          {error}
        </p>
      )}
      {team ? (
        <section className="reg-card">
          <div className="reg-section-head">
            <div>
              <small className="reg-label">Your team</small>
              <h2>{team.name}</h2>
            </div>
            <button className="reg-secondary" onClick={logout}>
              <LogOut size={15} />
              Log out
            </button>
          </div>
          <Roster team={team} />
          <Link href="/submit" className="reg-primary">
            Open submission desk
          </Link>
        </section>
      ) : (
        <Link className="reg-secondary" href="/login">
          Go to team login
        </Link>
      )}
    </>
  );
}
export function AdminDesk() {
  const [teams, setTeams] = useState<TeamProfile[] | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [selection, setSelection] = useState<string | null>(null),
    [mode, setMode] = useState<'inspect' | 'create' | 'edit'>('inspect'),
    [notice, setNotice] = useState('');
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/teams', { cache: 'no-store' });
      if (r.status === 401) {
        setTeams(null);
        return;
      }
      if (!r.ok) throw Error('Could not load the team directory.');
      setTeams(await r.json());
    } catch (e) {
      setError(problem(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  async function logout() {
    try {
      await send('/api/organizer/logout', 'POST');
      setTeams(null);
      setSelection(null);
      setMode('inspect');
      setNotice('');
    } catch (e) {
      setError(problem(e));
    }
  }
  const selected = teams?.find((t) => t.id === selection);
  async function saved() {
    setNotice(mode === 'create' ? 'Team created.' : 'Team updated.');
    setMode('inspect');
    await reload();
  }
  if (loading) return <p role="status">Loading teams…</p>;
  if (error)
    return (
      <div>
        <p className="reg-error" role="alert">
          {error}
        </p>
        <button className="reg-secondary" onClick={reload}>
          Retry
        </button>
      </div>
    );
  if (!teams)
    return (
      <div className="reg-auth-only">
        <LoginForm admin onSuccess={reload} />
      </div>
    );
  return (
    <>
      <div className="reg-page-heading">
        <div>
          <h1>Teams</h1>
          <p>
            {teams.length} registered {teams.length === 1 ? 'team' : 'teams'}
          </p>
        </div>
        <div className="reg-actions">
          <button
            className="reg-primary"
            onClick={() => {
              setMode('create');
              setSelection(null);
              setNotice('');
            }}
          >
            <Plus size={17} />
            Create team
          </button>
          <button className="reg-secondary" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
      {notice && (
        <p role="status" className="reg-notice">
          {notice}
        </p>
      )}
      <div className="reg-directory">
        <div className="reg-team-list" aria-label="Registered teams">
          {teams.length === 0 ? (
            <p className="reg-intro">No teams have registered yet.</p>
          ) : (
            teams.map((t) => (
              <button
                key={t.id}
                aria-pressed={selection === t.id}
                onClick={() => {
                  setSelection(t.id);
                  setMode('inspect');
                  setNotice('');
                }}
              >
                <span>{t.name}</span>
                <small>
                  {t.members.length}{' '}
                  {t.members.length === 1 ? 'member' : 'members'}
                </small>
              </button>
            ))
          )}
        </div>
        <section className="reg-card">
          {mode === 'create' ? (
            <>
              <h2>Create team</h2>
              <p className="reg-intro">
                Set a password to share with the team.
              </p>
              <RosterForm
                mode="create"
                onSaved={saved}
                onCancel={() => setMode('inspect')}
              />
            </>
          ) : selected ? (
            mode === 'edit' ? (
              <>
                <h2>Edit team</h2>
                <RosterForm
                  key={selected.id + '-' + selected.revision}
                  mode="edit"
                  team={selected}
                  onSaved={saved}
                  onCancel={() => setMode('inspect')}
                />
              </>
            ) : (
              <>
                <div className="reg-section-head">
                  <h2>{selected.name}</h2>
                  <button
                    className="reg-secondary"
                    onClick={() => setMode('edit')}
                  >
                    Edit team
                  </button>
                </div>
                <Roster team={selected} />
              </>
            )
          ) : (
            <div className="reg-empty">
              <UsersRound size={28} />
              <h2>Team details</h2>
              <p>Select a team to inspect its members.</p>
            </div>
          )}
        </section>
      </div>
      <Link className="reg-utility" href="/organizer">
        Open judging desk ↗
      </Link>
    </>
  );
}
