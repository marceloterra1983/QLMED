'use client';

import dynamic from 'next/dynamic';

const RotinasPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <RotinasPage />;
}
