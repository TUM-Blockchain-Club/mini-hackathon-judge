import { Header, Footer } from '@/components/chrome';
import { Organizer, Login } from '@/components/organizer';
import { db } from '@/lib/db';
import { currentAdmin } from '@/lib/auth';
import { desk } from '@/lib/store';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Organizer desk' };
export default async function Page() {
  let content;
  const admin = await currentAdmin();
  if (admin && !admin.owner && !admin.seat) {
    content = (
      <section className="panel">
        <h1>Team administration</h1>
        <p>Your account can manage team registrations.</p>
        <a href="/admin" className="button">
          Manage teams
        </a>
      </section>
    );
  } else if (admin) {
    try {
      const accounts = admin.owner
        ? await db()<
            { id: string; name: string; seat: number | null }[]
          >`SELECT id,name,seat FROM admin_accounts ORDER BY lower(name)`
        : [];
      content = (
        <Organizer
          data={await desk(admin.id)}
          admin={admin}
          accounts={Array.from(accounts)}
        />
      );
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
