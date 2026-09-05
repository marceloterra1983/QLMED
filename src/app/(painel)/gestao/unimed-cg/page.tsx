'use client';

import dynamic from 'next/dynamic';

const UnimedCgPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <UnimedCgPage />;
}
