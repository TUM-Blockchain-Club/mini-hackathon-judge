import { RegistrationFrame } from '@/components/registration/frame';
import { SubmissionDesk } from '@/components/submission-desk';
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

export const metadata = { title: 'Project submission' };
export default function Page() {
  return (
    <RegistrationFrame section="submit">
      <div className="submission-desk">
        <h1>Project submission</h1>
        <details className="submission-resources">
          <summary>Project resources</summary>
          <p>Include your pitch deck in the project commit or ZIP you submit.</p>
          <ul>
            {resources.map(({ label, href }) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </details>
        <SubmissionDesk />
      </div>
    </RegistrationFrame>
  );
}
