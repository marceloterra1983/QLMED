'use client';

import dynamic from 'next/dynamic';

const EmissoesNfePage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <EmissoesNfePage />;
}
