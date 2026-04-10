'use client';

import dynamic from 'next/dynamic';

const CustomersPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <CustomersPage />;
}