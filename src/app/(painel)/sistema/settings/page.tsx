'use client';

import dynamic from 'next/dynamic';

const SettingsPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <SettingsPage />;
}