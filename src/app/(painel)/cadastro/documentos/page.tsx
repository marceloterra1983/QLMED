'use client';

import dynamic from 'next/dynamic';

const DocumentosPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <DocumentosPage />;
}
