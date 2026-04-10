'use client';

import dynamic from 'next/dynamic';

const AutomacoesPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <AutomacoesPage />;
}