import type { Metadata } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/space-grotesk';
import '@fontsource/ibm-plex-mono/400.css';
import './globals.css';
export const metadata: Metadata = {
  title: {
    default: 'Mini Hackathon · Project submission',
    template: '%s · TBC Hackathon Hub',
  },
  description:
    'Submit a project for the LIGHT UP × TUM Blockchain Club mini hackathon.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
