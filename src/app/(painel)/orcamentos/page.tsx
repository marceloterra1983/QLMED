'use client';

import dynamic from 'next/dynamic';

const OrcamentosPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <OrcamentosPage />;
}
