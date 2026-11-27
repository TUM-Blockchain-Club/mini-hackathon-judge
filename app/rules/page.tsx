import { Header, Footer } from '@/components/chrome';
import { tracks, brief } from '@/lib/event';
import { ArrowUpRight } from 'lucide-react';
export const metadata = { title: 'Event brief' };
export default function Rules() {
  return (
    <>
      <Header section="brief" />
      <main className="wrap secondary">
        <div className="kicker">LIGHT UP × TUM BLOCKCHAIN CLUB</div>
        <h1>
          Event brief<span>.</span>
        </h1>
        <p className="lead">
          Choose a track and focus with your organizer. Submit the work your
          team wants the jury to evaluate.
        </p>
        <div className="track-grid">
          {tracks.map((t) => (
            <section className="panel" key={t.id}>
              <h2>{t.name}</h2>
              <ul className="focus-list">
                {t.focuses.map((f, i) => (
                  <li key={f}>
                    <b>{'ABC'[i]}</b>
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <section className="panel">
          <h2>How scoring works</h2>
          <p>
            The AI judge evaluates your submission against the criteria for your
            focus and records evidence for each award. The submission earns up
            to 50 points. The jury scores the live pitch out of 50. Together
            they give an overall percentage across all tracks.
          </p>
          <a
            className="text-link"
            href={brief}
            target="_blank"
            rel="noreferrer"
          >
            Read Andi’s full brief and templates <ArrowUpRight size={15} />
          </a>
        </section>
      </main>
      <Footer />
    </>
  );
}
