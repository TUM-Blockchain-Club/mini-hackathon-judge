import { Header, Footer } from '@/components/chrome';
import { Submission } from '@/components/submission';
import { currentTeam } from '@/lib/rosters';
import { publicEvent } from '@/lib/store';
import { eventDate, brief } from '@/lib/event';
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Flag,
  Layers3,
  BookOpen,
} from 'lucide-react';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const [event, team] = await Promise.all([publicEvent(), currentTeam()]);
  return (
    <>
      <Header section="desk" />
      <main className="wrap">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="spark">✳</span> LIGHT UP × TUM BLOCKCHAIN CLUB
            </div>
            <h1>
              Submission desk<span>.</span>
            </h1>
            <p>Hand in your team’s project for the mini hackathon.</p>
            <div className="hero-meta">
              <span>
                <CalendarDays />
                28 Nov 2026
              </span>
              <i />
              <span>
                <Layers3 />3 tracks
              </span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-grid" />
            <img src="/blocks.png" alt="" />
          </div>
        </section>
        <div className="columns">
          <Submission state={event.state} teamName={team?.name} />
          <aside>
            <section className="panel overview">
              <div className="kicker">EVENT INFO</div>
              <h2>At a glance</h2>
              <div className="info">
                <Clock3 />
                <div>
                  <small>Submission deadline</small>
                  <strong>
                    {event.deadline
                      ? eventDate(event.deadline)
                      : 'To be announced'}
                  </strong>
                </div>
              </div>
              <div className="info">
                <Flag />
                <div>
                  <small>Judging window</small>
                  <strong>10–15 min per project</strong>
                </div>
              </div>
              <div className="info">
                <Layers3 />
                <div>
                  <small>Overall score</small>
                  <strong>50 submission + 50 pitch</strong>
                </div>
              </div>
            </section>
            <section className="brief-card">
              <BookOpen size={23} />
              <h3>Need the brief?</h3>
              <p>
                Find the requirements, track focuses and submission template.
              </p>
              <a href={brief} target="_blank" rel="noreferrer">
                Open on GitHub <ArrowUpRight size={16} />
              </a>
            </section>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
