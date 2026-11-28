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
  closes,
  state,
  receipt,
}: {
  deadline?: string;
  commitDeadline?: string;
  closes?: string;
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
            one comparison, define a scoring rule, then show how it holds up in
            a hands-on test.
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
          <small>
            Find the full track briefs, rating matrices, sample data and
            submission templates.
          </small>
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
              Push your final work and pitch deck to the default branch by{' '}
              <b>{eventDate(commitDeadline)}</b>.
            </p>
          )}
          {closes && (
            <p>
              Late submissions close at <b>{eventDate(closes)}</b> and cost 5
              points.
            </p>
          )}
          {(state === 'closed' || state === 'late') && (
            <b>
              {state === 'closed'
                ? 'Submissions closed'
                : 'Late submission window'}
            </b>
          )}
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
          <ul>
            <li>
              Enter your <strong>project name</strong>, a description of up to
              500 characters, your track and your focus.
            </li>
            <li>
              Submit your <strong>public GitHub repository URL</strong>, for
              example <code>https://github.com/team/project</code>.
            </li>
            <li>
              You can submit early and keep working. Your receipt records the
              version at submission. Judging uses the latest default-branch
              commit dated at or before the cutoff.
            </li>
            <li>
              Include instructions for reproducing your result and explain how
              your scoring weights add up to 100.
            </li>
            <li>
              Ask another team to reproduce one result and record what they
              found.
            </li>
          </ul>
        </section>
        <section className="reg-card">
          <h2>Your five-minute demo</h2>
          <p>
            <strong>
              Pitches and awards · Saturday, 28 November · 17:00–18:00 CET
            </strong>
          </p>
          <ul>
            <li>
              Open with <strong>one result</strong> from your test.
            </li>
            <li>
              Show the evidence and explain how LIGHT UP can use the result.
            </li>
            <li>
              Leave time for questions within your <strong>five minutes</strong>
              .
            </li>
            <li>
              All tracks share one ranking, with{' '}
              <strong>50 points for the submission</strong> and{' '}
              <strong>50 for the jury pitch</strong>.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
