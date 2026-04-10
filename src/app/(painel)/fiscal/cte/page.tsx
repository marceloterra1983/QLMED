'use client';

import dynamic from 'next/dynamic';

const CtePage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <CtePage />;
}