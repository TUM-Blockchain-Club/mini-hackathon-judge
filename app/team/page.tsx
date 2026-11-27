import {
  EventPoster,
  RegistrationFrame,
} from '@/components/registration/frame';
import { TeamAccount } from '@/components/registration/dashboard';
export const metadata = { title: 'Your team' };
export default function Page() {
  return (
    <RegistrationFrame section="team">
      <div className="reg-split">
        <EventPoster />
        <TeamAccount />
      </div>
    </RegistrationFrame>
  );
}
