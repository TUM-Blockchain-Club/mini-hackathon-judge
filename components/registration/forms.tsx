'use client';
import { useId, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { teamNameHint, teamNamePattern } from '@/lib/team-name';
import type { Member, TeamProfile } from '@/lib/registration';

export async function send<T = unknown>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await r.json().catch(() => null);
  if (!r.ok) throw new Error(result?.error ?? 'The request failed. Try again.');
  return result;
}
export const problem = (e: unknown) =>
  e instanceof Error ? e.message : 'The request failed.';
function PasswordField({ create }: { create: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <label>
      {create ? 'Team password' : 'Password'}
      <span className="reg-password">
        <input
          name="password"
          aria-label={create ? 'Team password' : 'Password'}
          required
          minLength={create ? 10 : 1}
          maxLength={128}
          autoComplete={create ? 'new-password' : 'current-password'}
          type={visible ? 'text' : 'password'}
          placeholder={
            create ? 'At least 10 characters' : 'Enter your password'
          }
        />
        <button
          type="button"
          className="reg-eye"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}
const emptyMember = (): Member => ({ firstName: '', surname: '' });
export function RosterForm({
  mode,
  team,
  onSaved,
  onCancel,
}: {
  mode: 'signup' | 'create' | 'edit';
  team?: TeamProfile;
  onSaved: () => void | Promise<void>;
  onCancel?: () => void;
}) {
  const group = useId();
  const [name, setName] = useState(team?.name ?? '');
  const [members, setMembers] = useState(() =>
      (team?.members.length ? team.members : [emptyMember()]).map((m, i) => ({
        ...m,
        key: i,
      })),
    ),
    [nextKey, setNextKey] = useState(members.length);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  function add() {
    if (members.length < 3) {
      setMembers([...members, { ...emptyMember(), key: nextKey }]);
      setNextKey(nextKey + 1);
    }
  }
  function change(key: number, field: keyof Member, value: string) {
    setMembers((old) =>
      old.map((m) => (m.key === key ? { ...m, [field]: value } : m)),
    );
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await send(
        mode === 'signup'
          ? '/api/team/register'
          : mode === 'edit'
            ? '/api/admin/teams/' + team!.id
            : '/api/admin/teams',
        mode === 'edit' ? 'PATCH' : 'POST',
        {
          name: data.get('name'),
          members: members.map(({ firstName, surname }) => ({
            firstName,
            surname,
          })),
          password: data.get('password') ?? undefined,
          revision: team?.revision,
        },
      );
      await onSaved();
    } catch (err) {
      setError(problem(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="reg-form" onSubmit={submit}>
      <label>
        Team name
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          pattern={
            mode === 'edit' && name === team?.name
              ? undefined
              : teamNamePattern.source
          }
          title={teamNameHint}
          aria-describedby={group + '-name-hint'}
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={80}
          autoComplete="off"
          placeholder="e.g. Block_Builders"
        />
      </label>
      <small className="reg-field-help" id={group + '-name-hint'}>
        {teamNameHint}
      </small>
      {(mode !== 'edit' || !team?.revision) && <PasswordField create />}
      <div className="reg-members-head">
        <h3>Team members</h3>
        <span>{members.length} / 3</span>
      </div>
      <div className="reg-roster-fields">
        {members.map((m, i) => (
          <fieldset key={m.key}>
            <legend>Member {i + 1}</legend>
            <div className="reg-member-line">
              <label htmlFor={group + '-first-' + m.key}>
                First name
                <input
                  id={group + '-first-' + m.key}
                  value={m.firstName}
                  required
                  maxLength={80}
                  autoComplete="off"
                  placeholder="First name"
                  onChange={(e) => change(m.key, 'firstName', e.target.value)}
                />
              </label>
              <label htmlFor={group + '-last-' + m.key}>
                Surname
                <input
                  id={group + '-last-' + m.key}
                  value={m.surname}
                  required
                  maxLength={80}
                  autoComplete="off"
                  placeholder="Surname"
                  onChange={(e) => change(m.key, 'surname', e.target.value)}
                />
              </label>
              {members.length > 1 && (
                <button
                  type="button"
                  className="reg-remove"
                  aria-label={'Remove member ' + (i + 1)}
                  onClick={() =>
                    setMembers(members.filter((x) => x.key !== m.key))
                  }
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </fieldset>
        ))}
      </div>
      {members.length < 3 && (
        <button type="button" className="reg-add" onClick={add}>
          <Plus size={15} />
          Add member
        </button>
      )}
      {error && (
        <p className="reg-error" role="alert">
          {error}
        </p>
      )}
      <div className="reg-actions">
        <button className="reg-primary" disabled={busy}>
          {busy
            ? 'Saving…'
            : mode === 'signup'
              ? 'Register team'
              : mode === 'create'
                ? 'Create team'
                : 'Save changes'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="reg-secondary">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
export function LoginForm({
  admin = false,
  onSuccess,
}: {
  admin?: boolean;
  onSuccess: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await send(admin ? '/api/organizer/login' : '/api/team/login', 'POST', {
        name: f.get('name'),
        password: f.get('password'),
      });
      await onSuccess();
    } catch (err) {
      setError(problem(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={admin ? 'reg-card' : 'submission-auth-form'}>
      <h2>{admin ? 'Admin login' : 'Team login'}</h2>
      <p className="reg-intro">
        {admin
          ? 'Sign in to manage team registrations.'
          : 'Every teammate signs in with the same team name and password.'}
      </p>
      <form className="reg-form" onSubmit={submit}>
        <label>
          {admin ? 'Admin name' : 'Team name'}
          <input
            name="name"
            required={!admin}
            maxLength={80}
            autoComplete="username"
            placeholder={admin ? 'Organizer' : 'Your team name'}
          />
        </label>
        <PasswordField create={false} />
        {error && (
          <p className="reg-error" role="alert">
            {error}
          </p>
        )}
        <button className="reg-primary" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </section>
  );
}
