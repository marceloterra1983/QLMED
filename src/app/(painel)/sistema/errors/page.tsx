'use client';

import dynamic from 'next/dynamic';

const ErrorsPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <ErrorsPage />;
}