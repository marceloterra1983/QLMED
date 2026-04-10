'use client';

import dynamic from 'next/dynamic';

const AnvisaPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <AnvisaPage />;
}