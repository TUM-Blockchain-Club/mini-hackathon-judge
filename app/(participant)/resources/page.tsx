import { ArrowUpRight, Download, FileText } from 'lucide-react';

const lightUpRepo = 'https://github.com/andi-lightup/lightup-tbc-hackathon';

const sections = [
  {
    title: 'Event downloads',
    links: [
      {
        label: 'Participant materials (ZIP)',
        description: 'Event brief, track guides, reference matrices and submission template',
        href: '/docs/participant-materials.zip',
      },
      {
        label: 'Andi’s LIGHT UP hackathon slides (PDF)',
        href: '/docs/light-up-hackathon-slides.pdf',
      },
      {
        label: 'Student AI tools setup guide (PDF)',
        href: '/docs/student-ai-tools.pdf',
      },
    ],
  },
  {
    title: 'Optional background',
    links: [
      { label: 'Original LIGHT UP challenge and scoring exercises (GitHub)', href: lightUpRepo },
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
      <div className="resource-groups">
        {sections.map(({ title, links }) => (
          <section key={title} className="reg-card resource-group">
            <h2>{title}</h2>
            <ul className="resource-list">
              {links.map((link) => {
                const download = link.href.endsWith('.zip');
                const Icon = download ? Download : link.href.endsWith('.pdf') ? FileText : ArrowUpRight;
                return (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      download={download || undefined}
                      target={download ? undefined : '_blank'}
                      rel={download ? undefined : 'noopener noreferrer'}
                    >
                      <span>
                        {link.label}
                        {'description' in link && <small>{link.description}</small>}
                      </span>
                      <Icon size={18} aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
