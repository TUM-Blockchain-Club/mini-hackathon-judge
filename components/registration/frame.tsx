import Link from 'next/link';
import { CalendarDays, LockKeyhole, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
import '@fontsource-variable/montserrat';
import './registration.css';

export function RegistrationFrame({
  section,
  children,
}: {
  section: 'register' | 'login' | 'admin' | 'team';
  children: ReactNode;
}) {
  return (
    <div className="reg-site">
      <header className="reg-header">
        <div className="reg-width reg-nav">
          <Link
            className="reg-brand"
            href="/"
            aria-label="TUM Blockchain Club registration"
          >
            <img
              src="/registration/tbc-icon.png"
              width="34"
              height="34"
              alt=""
            />
            <span className="reg-brand-full">TUM Blockchain Club</span>
            <span className="reg-brand-short">TBC</span>
          </Link>
          <nav aria-label="Team portal">
            <Link
              href="/"
              aria-current={section === 'register' ? 'page' : undefined}
            >
              Register
            </Link>
            <Link
              href={section === 'team' ? '/team' : '/login'}
              aria-current={
                section === 'login' || section === 'team' ? 'page' : undefined
              }
            >
              {section === 'team' ? 'My team' : 'Team login'}
            </Link>
            <Link
              href="/admin"
              className="reg-admin-link"
              aria-current={section === 'admin' ? 'page' : undefined}
            >
              <LockKeyhole size={14} />
              Admin
            </Link>
          </nav>
        </div>
      </header>
      <main className="reg-width reg-main">{children}</main>
      <footer className="reg-footer">
        <div className="reg-width">
          <span>
            TUM Blockchain Club <b>×</b> LIGHT UP
          </span>
          <a
            href="https://github.com/andi-lightup/lightup-tbc-hackathon"
            target="_blank"
            rel="noreferrer"
          >
            Event brief ↗
          </a>
        </div>
      </footer>
    </div>
  );
}
export function EventPoster() {
  return (
    <section className="reg-poster" aria-label="Mini Hackathon event">
      <div className="reg-poster-copy">
        <div className="reg-byline">
          <i /> LIGHT UP × TBC
        </div>
        <h1>
          Mini
          <br />
          <em>Hackathon</em>
        </h1>
        <div className="reg-meta">
          <span>
            <CalendarDays size={16} />
            28 November 2026
          </span>
          <span>
            <UsersRound size={16} />
            1–3 people per team
          </span>
        </div>
      </div>
      <figure className="reg-photo">
        <img
          src="/registration/hackathon-2026.webp"
          alt="Participants working side by side at TBC’s 2026 hackathon"
        />
        <figcaption>
          TBC Hackathon 2026 <span>Photo: dng.photo</span>
        </figcaption>
      </figure>
    </section>
  );
}
