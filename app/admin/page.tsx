import { RegistrationFrame } from '@/components/registration/frame';
import { AdminDesk } from '@/components/registration/dashboard';
export const metadata = { title: 'Team administration' };
export default function Page() {
  return (
    <RegistrationFrame section="admin">
      <AdminDesk />
    </RegistrationFrame>
  );
}
