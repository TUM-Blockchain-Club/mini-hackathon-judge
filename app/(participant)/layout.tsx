'use client';

import { Activity, type ReactNode } from 'react';
import { useSelectedLayoutSegment } from 'next/navigation';
import { RegistrationFrame } from '@/components/registration/frame';
import { SubmissionDesk } from '@/components/submission-desk';

export default function ParticipantLayout({
  children,
}: {
  children: ReactNode;
}) {
  const resources = useSelectedLayoutSegment() === 'resources';
  return (
    <RegistrationFrame section={resources ? 'resources' : 'submit'}>
      <div className="submission-desk">
        {children}
        {/* Keep the draft, including the browser's file selection, across tab changes. */}
        <Activity mode={resources ? 'hidden' : 'visible'}>
          <SubmissionDesk />
        </Activity>
      </div>
    </RegistrationFrame>
  );
}
