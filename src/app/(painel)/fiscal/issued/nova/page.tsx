'use client';

import dynamic from 'next/dynamic';

const EmitirNfePage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <EmitirNfePage />;
}
