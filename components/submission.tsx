'use client';
import { useState } from 'react';
import {
  GitBranch,
  FileUp,
  Upload,
  Check,
  ClipboardCheck,
  Send,
  FolderGit2,
} from 'lucide-react';
import { tracks, eventDate } from '@/lib/event';
type Receipt = { id: string; team: string; date: string; digest: string };
export function Submission({
  state,
  teamName,
}: {
  state: string;
  teamName?: string;
}) {
  const [method, setMethod] = useState('github'),
    [track, setTrack] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [receipt, setReceipt] = useState<Receipt | null>(null);
  const [fileName, setFileName] = useState('');
  const open = state === 'open';
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.set('method', method);
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        body: data,
      });
      const result = await res.json();
      if (!res.ok) throw Error(result.error);
      setReceipt(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setBusy(false);
    }
  }
  if (receipt)
    return (
      <section className="panel receipt" role="status">
        <div className="icon-tile">
          <ClipboardCheck />
        </div>
        <div className="kicker">SUBMISSION RECEIPT</div>
        <h2>Project received.</h2>
        <p>
          {receipt.team} · {eventDate(receipt.date)}
        </p>
        <dl>
          <dt>Receipt ID</dt>
          <dd>{receipt.id}</dd>
          <dt>File fingerprint (SHA-256)</dt>
          <dd>{receipt.digest}</dd>
        </dl>
        <p>You can replace this submission before the deadline.</p>
        <button
          className="button"
          onClick={() => {
            setReceipt(null);
            setFileName('');
          }}
        >
          Submit a revision
        </button>
      </section>
    );
  return (
    <section className="panel submit-panel">
      <div className="panel-head">
        <div className="title-with-icon">
          <div className="icon-tile">
            <FolderGit2 size={22} />
          </div>
          <h2>Project submission</h2>
        </div>
        <span className={'status ' + (open ? 'green' : '')}>
          <i />
          {open
            ? 'Open'
            : state === 'closed'
              ? 'Closed'
              : state === 'unavailable'
                ? 'Unavailable'
                : 'Awaiting kickoff'}
        </span>
      </div>
      <form onSubmit={submit}>
        <div className="fields">
          {teamName ? (
            <label>
              Team
              <input readOnly value={teamName} />
            </label>
          ) : (
            <label>
              Team access code
              <input
                name="code"
                autoComplete="off"
                placeholder="Code from your organizer"
                required
                maxLength={64}
              />
            </label>
          )}
          <label>
            Project title
            <input
              name="title"
              placeholder="Your project name"
              required
              maxLength={100}
            />
          </label>
        </div>
        <div className="fields">
          <label>
            Track
            <select
              aria-label="Track"
              required
              value={track}
              onChange={(e) => setTrack(e.target.value)}
            >
              <option value="">Select track</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Focus
            <select
              aria-label="Focus"
              key={track}
              name="focus"
              required
              defaultValue=""
              disabled={!track}
            >
              <option value="">Select focus</option>
              {tracks
                .find((t) => t.id === track)
                ?.focuses.map((f, i) => (
                  <option key={f} value={track + '-' + 'ABC'[i]}>
                    {'ABC'[i]} · {f}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Submission method</legend>
          <div className="segmented">
            {[
              ['github', 'GitHub commit'],
              ['file', 'File upload'],
            ].map(([v, label]) => (
              <button
                type="button"
                key={v}
                aria-pressed={method === v}
                onClick={() => setMethod(v)}
              >
                {v === 'github' ? (
                  <GitBranch size={17} />
                ) : (
                  <FileUp size={17} />
                )}{' '}
                {label}
                {method === v && <Check className="selected-check" size={14} />}
              </button>
            ))}
          </div>
        </fieldset>
        {method === 'github' ? (
          <label>
            Commit URL
            <input
              type="url"
              name="commit"
              placeholder="https://github.com/team/project/commit/…"
              required
            />
            <small>Use the full commit link from a public repository.</small>
          </label>
        ) : (
          <label className="file-box">
            <Upload size={22} />
            <strong>{fileName || 'Choose a file'}</strong>
            <small>ZIP, PDF, spreadsheet, document or text · up to 3 MiB</small>
            <input
              type="file"
              name="file"
              accept=".zip,.xlsx,.docx,.pdf,.md,.txt,.csv,.json,.py,.js"
              required
              onChange={(e) => setFileName(e.target.files?.[0]?.name || '')}
            />
          </label>
        )}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="form-foot">
          <span>
            {open
              ? 'You can resubmit until the deadline.'
              : state === 'closed'
                ? 'The submission window has closed.'
                : state === 'unavailable'
                  ? 'The event service is unavailable.'
                  : 'Your organizer will open submissions.'}
          </span>
          <button className="primary" disabled={!open || busy}>
            <Send size={16} />
            {busy ? 'Submitting…' : 'Submit project'}
          </button>
        </div>
      </form>
    </section>
  );
}
