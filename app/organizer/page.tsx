import { Header, Footer } from '@/components/chrome';
import { Organizer, Login } from '@/components/organizer';
import { signedIn } from '@/lib/auth';
import { desk } from '@/lib/store';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Organizer desk' };
export default async function Page() {
  let content;
  if (await signedIn()) {
    try {
      content = <Organizer data={await desk()} />;
    } catch {
      content = (
        <section className="panel login">
          <h2>Database unavailable</h2>
          <p>Check the event database connection and run the schema setup.</p>
        </section>
      );
    }
  } else {
    content = <Login />;
  }
  return (
    <>
      <Header />
      <main className="wrap secondary">{content}</main>
      <Footer />
    </>
  );
}
