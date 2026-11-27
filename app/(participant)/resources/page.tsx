import { ArrowUpRight } from 'lucide-react';
import { brief } from '@/lib/event';

const resources = [
  { label: 'Andi’s hackathon brief and tracks (GitHub)', href: brief },
  {
    label: 'Student AI tools setup guide (PDF)',
    href: '/docs/student-ai-tools.pdf',
  },
  { label: 'Rating matrices', href: `${brief}/tree/main/matrices` },
  {
    label: 'Hands-on test log',
    href: `${brief}/blob/main/templates/hands-on-test.md`,
  },
  {
    label: 'Submission template',
    href: `${brief}/blob/main/templates/comparison.md`,
  },
  {
    label: 'Pitch scoring criteria',
    href: `${brief}/blob/main/templates/pitch-scoring.md`,
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
