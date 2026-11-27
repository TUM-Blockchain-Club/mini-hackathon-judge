import type { FormEvent } from 'react';
export type Account = { id: string; name: string; seat: number | null };
export function AdminAccounts({
  accounts,
  busy,
  act,
  setNotice,
}: {
  accounts: Account[];
  busy: boolean;
  act: (action: string, body: unknown, done: () => void) => Promise<void>;
  setNotice: (text: string) => void;
}) {
  function account(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    void act(
      'admin',
      {
        name: f.get('name'),
        password: f.get('password'),
        seat: Number(f.get('seat')) || null,
      },
      () => {
        form.reset();
        setNotice('Admin account created.');
      },
    );
  }
  return (
    <details className="panel setup">
      <summary>Admins and jury seats</summary>
      <form onSubmit={account}>
        <label>
          New admin name
          <input name="name" required maxLength={80} autoComplete="off" />
        </label>
        <label>
          Initial password
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <label>
          Account role
          <select name="seat">
            <option value="">Team admin</option>
            {[1, 2, 3]
              .filter((n) => !accounts.some((a) => a.seat === n))
              .map((n) => (
                <option key={n} value={n}>
                  Juror {n}
                </option>
              ))}
          </select>
        </label>
        <button className="button" disabled={!!busy}>
          Create admin
        </button>
      </form>
      {accounts.map((a) => (
        <form
          key={a.id}
          className="pitch"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(
              'seat',
              { id: a.id, seat: Number(f.get('seat')) || null },
              () => setNotice('Role saved.'),
            );
          }}
        >
          <label>
            {a.name}
            <select
              key={String(a.seat)}
              name="seat"
              defaultValue={a.seat ?? ''}
            >
              <option value="">Team admin</option>
              {[1, 2, 3]
                .filter(
                  (n) => n === a.seat || !accounts.some((x) => x.seat === n),
                )
                .map((n) => (
                  <option key={n} value={n}>
                    Juror {n}
                  </option>
                ))}
            </select>
          </label>
          <button className="button" disabled={!!busy}>
            Save role
          </button>
        </form>
      ))}
    </details>
  );
}
