'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'sonner';
import { ReactNode } from 'react';
import { PushResubscribe } from '@/components/PushResubscribe';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <PushResubscribe />
      {children}
      <Toaster position="top-right" richColors closeButton />
    </SessionProvider>
  );
}
