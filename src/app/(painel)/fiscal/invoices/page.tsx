'use client';

import dynamic from 'next/dynamic';

const InvoicesPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <InvoicesPage />;
}