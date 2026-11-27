import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import type { ReactNode } from 'react';
import '@fontsource-variable/montserrat';
import './registration.css';

export function RegistrationFrame({
  section,
  children,
}: {
  section: 'submit' | 'admin';
  children: ReactNode;
}) {
  return (
    <div className="reg-site">
      <header className="reg-header">
        <div className="reg-width reg-nav">
          <Link
            className="reg-brand"
            href="/submit"
            aria-label="TUM Blockchain Club submissions"
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
            {section === 'admin' && <Link href="/submit">Submission</Link>}
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
        </div>
      </footer>
    </div>
  );
}
