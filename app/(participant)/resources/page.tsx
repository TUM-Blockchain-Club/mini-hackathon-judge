import { ArrowUpRight } from 'lucide-react';

const lightUpRepo = 'https://github.com/andi-lightup/lightup-tbc-hackathon';

const sections = [
  {
    title: 'Hackathon materials',
    links: [
      { label: 'LIGHT UP hackathon brief (GitHub)', href: lightUpRepo },
      { label: 'Track briefs', href: `${lightUpRepo}/tree/main/tracks` },
      { label: 'Rating matrices', href: `${lightUpRepo}/tree/main/matrices` },
      {
        label: 'Submission template, hands-on test log and pitch criteria',
        href: `${lightUpRepo}/tree/main/templates`,
      },
      {
        label: 'Tax tool sample dataset',
        href: `${lightUpRepo}/tree/main/data/taxtool-sample`,
      },
    ],
  },
  {
    title: 'Downloads',
    links: [
      {
        label: 'Hackathon brief, tracks, rating matrices and templates (ZIP)',
        href: '/docs/participant-materials.zip',
      },
      {
        label: 'Student AI tools setup guide (PDF)',
        href: '/docs/student-ai-tools.pdf',
      },
    ],
  },
  {
    title: 'LIGHT UP comparisons (German)',
    links: [
      { label: 'Testing methodology', href: 'https://lightupkryptos.de/so-testen-wir/' },
      { label: 'Crypto exchanges (video)', href: 'https://youtu.be/Py4EBRDl4zU' },
      { label: 'Hardware wallets (video)', href: 'https://youtu.be/amlvSdwGT98' },
      { label: 'Tax tools (video)', href: 'https://youtu.be/Vs46Y9VhqGM' },
    ],
  },
];

export const metadata = { title: 'Resources' };

export default function Page() {
  return (
    <>
      <h1>Resources</h1>
      {sections.map(({ title, links }) => (
        <section key={title}>
          <h2>{title}</h2>
          <ul className="reg-card resource-list">
            {links.map(({ label, href }) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {label}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
