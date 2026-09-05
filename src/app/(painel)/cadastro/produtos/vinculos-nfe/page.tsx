'use client';

import dynamic from 'next/dynamic';

const VinculosNfePage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <VinculosNfePage />;
}
