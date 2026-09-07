'use client';

import dynamic from 'next/dynamic';

const SaidaMaterialPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <SaidaMaterialPage />;
}
