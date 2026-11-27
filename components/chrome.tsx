import Link from 'next/link';
import { ArrowUpRight, LockKeyhole } from 'lucide-react';
import { brief } from '@/lib/event';
export function Mark() {
  return (
    <span className="brandmark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
export function Header({
  section,
}: {
  section: 'desk' | 'brief' | 'organizer';
}) {
  return (
    <header>
      <div className="wrap navwrap">
        <Link href="/" className="brand">
          <Mark />
          TBC <span className="slash">/</span>{' '}
          <span className="brand-sub">Hackathon Hub</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link
            href="/submit"
            aria-current={section === 'desk' ? 'page' : undefined}
          >
            Submission desk
          </Link>
          <Link
            href="/rules"
            aria-current={section === 'brief' ? 'page' : undefined}
          >
            Event brief
          </Link>
        </nav>
        <Link
          className="organizer-link"
          href="/organizer"
          aria-current={section === 'organizer' ? 'page' : undefined}
        >
          <LockKeyhole size={15} />
          Organizer
        </Link>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer>
      <div className="wrap footer">
        <span>
          <Mark /> TUM Blockchain Club <span className="foot-x">×</span> LIGHT
          UP
        </span>
        <a href={brief} target="_blank" rel="noreferrer">
          Hackathon repository <ArrowUpRight size={14} />
        </a>
      </div>
    </footer>
  );
}
