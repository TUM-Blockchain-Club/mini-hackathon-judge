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
export function Header() {
  return (
    <header>
      <div className="wrap navwrap">
        <Link href="/" className="brand">
          <Mark />
          TBC <span className="slash">/</span>{' '}
          <span className="brand-sub">Hackathon Hub</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/submit">Submission</Link>
          <Link href="/resources">Resources</Link>
          <Link href="/admin">Teams</Link>
        </nav>
        <Link
          className="organizer-link"
          href="/organizer"
          aria-current="page"
          aria-label="Organizer"
        >
          <LockKeyhole size={15} aria-hidden="true" />
          <span>Organizer</span>
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
