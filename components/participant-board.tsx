import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Clock3 } from 'lucide-react';
import { eventDate, tracks } from '@/lib/event';
import type { SubmissionReceipt } from '@/lib/types';

const questions = {
  exchange: 'What should beginners know before choosing an exchange?',
  wallet: 'How would you rate software wallets from scratch?',
  tax: 'Which tax tool fits a reader’s transactions and budget?',
};

export function ParticipantBoard({
  deadline,
  commitDeadline,
  state,
  receipt,
}: {
  deadline?: string;
  commitDeadline?: string;
  state: string;
  receipt: SubmissionReceipt | null;
}) {
  return (
    <div className="board-content">
      <div className="board-lead">
        <section className="reg-card board-challenge">
          <h2>The LIGHT UP challenge</h2>
          <p>
            Help beginners choose a crypto exchange, wallet or tax tool. Pick
            a track, try it for yourself and share what you learn.
          </p>
          <a
            className="board-brief"
            href="https://github.com/andi-lightup/lightup-tbc-hackathon"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the full LIGHT UP challenge on GitHub{' '}
            <ArrowUpRight size={20} aria-hidden="true" />
          </a>
          <small>The original brief’s scoring exercises are optional. Use the submission checklist below for this event.</small>
        </section>
        <section className="reg-card board-deadline">
          <h2>
            <Clock3 size={22} aria-hidden="true" /> Submission deadline
          </h2>
          <strong>
            {deadline ? eventDate(deadline) : 'Deadline unavailable'}
          </strong>
          {commitDeadline && (
            <p>
              <strong>Push your final work and pitch deck to the default branch by {eventDate(commitDeadline)}.</strong>
            </p>
          )}
          {state === 'closed' && <b>Submissions closed</b>}
        </section>
      </div>
      <nav className="board-destinations" aria-label="Team workspace">
        <Link href="/submit">
          <span>
            Submission <ArrowRight aria-hidden="true" />
          </span>
          <small>
            {receipt
              ? 'View receipt · ' + receipt.title
              : 'Submit the link to your public GitHub repository.'}
          </small>
        </Link>
        <Link href="/resources">
          <span>
            Resources <ArrowRight aria-hidden="true" />
          </span>
          <small>Download the event materials and AI tools guide.</small>
        </Link>
      </nav>
      <section className="board-tracks">
        <h2>Choose your track</h2>
        <div>
          {tracks.map((track) => (
            <article key={track.id} className="reg-card">
              <h3>{track.name}</h3>
              <p>{questions[track.id]}</p>
              <ol type="A">
                {track.focuses.map((focus) => (
                  <li key={focus}>{focus}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>
      <div className="board-guides">
        <section className="reg-card">
          <h2>What to submit</h2>
          <p>Only one team member submits the project.</p>
          <ul>
            <li>Project name and description (up to 500 characters)</li>
            <li>Track and focus</li>
            <li>Public GitHub repository URL</li>
            <li>Pitch deck on the default branch</li>
          </ul>
        </section>
        <section className="reg-card">
          <h2>Your five-minute demo</h2>
          <p>
            <strong>
              17:00–18:00 CET
            </strong>
          </p>
          <ul>
            <li>
              The first <strong>five minutes</strong> are yours to present.
            </li>
            <li>Show us what you tried, what you found and how LIGHT UP could use it. One example is plenty.</li>
            <li>After your demo, we’ll have a <strong>short Q&amp;A</strong>.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
