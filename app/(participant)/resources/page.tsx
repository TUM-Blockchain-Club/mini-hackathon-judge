import { ArrowUpRight } from 'lucide-react';

const resources = [
  {
    label: 'Hackathon brief, tracks, rating matrices and templates (ZIP)',
    href: '/docs/participant-materials.zip',
  },
  {
    label: 'Student AI tools setup guide (PDF)',
    href: '/docs/student-ai-tools.pdf',
  },
];

export const metadata = { title: 'Resources' };

export default function Page() {
  return (
    <>
      <h1>Resources</h1>
      <ul className="reg-card resource-list">
        {resources.map(({ label, href }) => (
          <li key={href}>
            <a href={href} target="_blank" rel="noopener noreferrer">
              {label}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
