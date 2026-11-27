import { RegistrationFrame } from '@/components/registration/frame';
import { SubmissionDesk } from '@/components/submission-desk';
export const metadata = { title: 'Project submission' };
export default function Page() {
  return (
    <RegistrationFrame section="submit">
      <div className="submission-desk">
        <h1>Project submission</h1>
        <SubmissionDesk />
      </div>
    </RegistrationFrame>
  );
}
