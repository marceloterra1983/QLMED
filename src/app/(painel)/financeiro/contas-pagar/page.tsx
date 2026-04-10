'use client';

import dynamic from 'next/dynamic';

const ContasPagarPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <ContasPagarPage />;
}