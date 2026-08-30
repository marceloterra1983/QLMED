'use client';

import dynamic from 'next/dynamic';

const ImpcgPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <ImpcgPage />;
}
