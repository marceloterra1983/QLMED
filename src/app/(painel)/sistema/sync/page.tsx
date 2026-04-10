'use client';

import dynamic from 'next/dynamic';

const SyncPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <SyncPage />;
}