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
  const segment = useSelectedLayoutSegment();
  const resources = segment === 'resources';
  const board = segment === 'board';
  return (
    <RegistrationFrame
      section={resources ? 'resources' : board ? 'board' : 'submit'}
    >
      <div className={board ? 'participant-board' : 'submission-desk'}>
        {children}
        {/* Keep the draft, including the browser's file selection, across tab changes. */}
        <Activity mode={resources ? 'hidden' : 'visible'}>
          <SubmissionDesk board={board} />
        </Activity>
      </div>
    </RegistrationFrame>
  );
}
