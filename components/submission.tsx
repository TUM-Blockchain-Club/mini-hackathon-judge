'use client';
import { useState } from 'react';
import { tracks, eventDate, focusLabel, ownTopicLimit } from '@/lib/event';
import type { SubmissionReceipt } from '@/lib/types';
export function Submission({
  state,
  teamId,
  teamName,
  receipt,
  onSubmitted,
  refresh,
}: {
  state: string;
  teamId: string;
  teamName: string;
  receipt: SubmissionReceipt | null;
  onSubmitted: (receipt: SubmissionReceipt) => void;
  refresh: () => Promise<void>;
}) {
  const [method, setMethod] = useState('github'),
    [track, setTrack] = useState(''),
    [focus, setFocus] = useState(''),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const open = state === 'open' || state === 'late';
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!open || busy) return;
    const data = new FormData(e.currentTarget);
    data.set('method', method);
    data.set('sessionTeam', teamId);
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        body: data,
      });
      const result = await res.json();
      if (!res.ok) {
        if (res.status === 401 || res.status === 409) await refresh();
        throw Error(result.error ?? 'Could not submit your project.');
      }
      setEditing(false);
      onSubmitted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setBusy(false);
    }
  }
  if (receipt && (!editing || !open))
    return (
      <section className="submission-receipt" role="status">
        <h2>Project received.</h2>
        <p>
          {teamName} · {eventDate(receipt.date)}
        </p>
        <p>
          {receipt.title} · {focusLabel(receipt.focus, receipt.ownTopic)}
        </p>
        <p>
          Receipt ID <code>{receipt.id}</code>
        </p>
        {receipt.late && (
          <p>Late submission · 5 points deducted from the overall score.</p>
        )}
        <details>
          <summary>File fingerprint (SHA-256)</summary>
          <code>{receipt.digest}</code>
        </details>
        {open && (
          <button
            className="reg-secondary"
            onClick={() => {
              setTrack(receipt.focus.split('-')[0]);
              setFocus(receipt.focus);
              setEditing(true);
            }}
          >
            Submit a revision
          </button>
        )}
      </section>
    );
  return (
    <form className="reg-form project-form" onSubmit={submit}>
      <label>
        Project title
        <input
          name="title"
          required
          maxLength={100}
          defaultValue={receipt?.title}
        />
      </label>
      <div className="submission-choices">
        <label>
          Track
          <select
            aria-label="Track"
            required
            value={track}
            onChange={(e) => {
              setTrack(e.target.value);
              setFocus('');
            }}
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
            name="focus"
            required
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
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
            {track && (
              <option value={track + '-own'}>Own topic in this track</option>
            )}
          </select>
        </label>
      </div>
      {focus.endsWith('-own') && (
        <label>
          What is your team’s focus?
          <input
            name="ownTopic"
            required
            pattern={'.*\\S.*'}
            maxLength={ownTopicLimit}
            defaultValue={
              receipt?.focus === focus ? (receipt.ownTopic ?? '') : ''
            }
            placeholder="Describe the specific question your project investigates"
          />
        </label>
      )}
      <fieldset className="submission-method">
        <legend>Submit as</legend>
        {[
          ['github', 'GitHub commit'],
          ['file', 'File upload'],
        ].map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="method"
              value={value}
              checked={method === value}
              onChange={() => setMethod(value)}
            />
            {label}
          </label>
        ))}
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
        <label>
          Project file
          <input
            type="file"
            name="file"
            required
            accept=".zip,.xlsx,.docx,.pdf,.md,.txt,.csv,.json,.py,.js"
          />
          <small>ZIP, PDF, spreadsheet, document or text · up to 3 MiB</small>
        </label>
      )}
      <small>
        Include your pitch deck in the project commit or ZIP you submit.
      </small>
      {error && (
        <p className="reg-error" role="alert">
          {error}
        </p>
      )}
      <div className="submission-send">
        <button className="reg-primary" disabled={!open || busy}>
          {busy ? 'Submitting…' : 'Submit project'}
        </button>
        <small aria-live="polite">
          {state === 'closed'
            ? 'The submission window has closed.'
            : state === 'pending'
              ? 'Submissions have not opened yet.'
              : state === 'unavailable'
                ? 'The submission service is unavailable.'
                : state === 'late'
                  ? 'Submitting now applies the 5-point late deduction.'
                  : ''}
        </small>
      </div>
    </form>
  );
}
