'use client';

import dynamic from 'next/dynamic';

const FiscalDashboardPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <FiscalDashboardPage />;
}