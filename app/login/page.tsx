import {
  EventPoster,
  RegistrationFrame,
} from '@/components/registration/frame';
import { LoginForm } from '@/components/registration/forms';
export const metadata = { title: 'Team login' };
export default function Page() {
  return (
    <RegistrationFrame section="login">
      <div className="reg-split">
        <EventPoster />
        <LoginForm />
      </div>
    </RegistrationFrame>
  );
}
