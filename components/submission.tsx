'use client';
import { useState } from 'react';
import { tracks, eventDate, focusLabel, ownTopicLimit } from '@/lib/event';
import type { SubmissionReceipt } from '@/lib/types';
export function Submission({
  state,
  commitDeadline,
  teamId,
  teamName,
  receipt,
  onSubmitted,
  refresh,
}: {
  state: string;
  commitDeadline?: string;
  teamId: string;
  teamName: string;
  receipt: SubmissionReceipt | null;
  onSubmitted: (receipt: SubmissionReceipt) => void;
  refresh: () => Promise<void>;
}) {
  const [track, setTrack] = useState(''),
    [focus, setFocus] = useState(''),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const cutoff = commitDeadline ? eventDate(commitDeadline) : 'the commit cutoff';
  const open = state === 'open' || state === 'late';
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!open || busy) return;
    const data = new FormData(e.currentTarget);
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
        {receipt.description && <p>{receipt.description}</p>}
        {receipt.commitUrl && <p><a className="text-link" href={receipt.commitUrl}>View commit at registration</a></p>}
        {receipt.judgedCommitUrl && <p><a className="text-link" href={receipt.judgedCommitUrl}>View commit selected for judging</a></p>}
        {receipt.commitUrl && !receipt.judgedCommitUrl && <p>The judge selects the latest default-branch commit dated at or before {cutoff}.</p>}
        <p>
          Receipt ID <code>{receipt.id}</code>
        </p>
        {receipt.late && (
          <p>Late submission · 5 points deducted from the overall score.</p>
        )}
        <details>
          <summary>Registration snapshot fingerprint (SHA-256)</summary>
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
        Project name
        <input
          name="title"
          required
          maxLength={100}
          defaultValue={receipt?.title}
        />
      </label>
      <label>
        GitHub repository link
        <input type="url" name="repository" required maxLength={200}
          placeholder="https://github.com/team/project"
          defaultValue={receipt?.commitUrl?.split('/commit/')[0]} />
      </label>
      <label>
        Short description
        <textarea name="description" rows={3} required maxLength={500}
          placeholder="What did your team build, and who is it for?"
          defaultValue={receipt?.description ?? ''} />
      </label>
      <section className="submission-requirements" aria-label="Submission requirements">
        <strong>Submission requirements</strong>
        <ul>
          <li><strong>Make the repository public.</strong></li>
          <li><strong>Push your final work and pitch deck to the default branch by {cutoff}.</strong></li>
          <li>Only one team member submits the project.</li>
        </ul>
      </section>
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
