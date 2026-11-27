import Link from 'next/link';
import {
  EventPoster,
  RegistrationFrame,
} from '@/components/registration/frame';
import { RosterForm } from '@/components/registration/forms';
export default function Page() {
  return (
    <RegistrationFrame section="register">
      <div className="reg-split">
        <EventPoster />
        <section className="reg-card">
          <h2>Register your team</h2>
          <p className="reg-intro">
            Enter your team name and add one to three members.
          </p>
          <RosterForm mode="signup" />
          <p className="reg-after">
            Already registered? <Link href="/login">Log in</Link>
          </p>
        </section>
      </div>
    </RegistrationFrame>
  );
}
