'use client';

import dynamic from 'next/dynamic';

const IssuedInvoicesPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <IssuedInvoicesPage />;
}