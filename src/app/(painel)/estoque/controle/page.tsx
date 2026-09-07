'use client';

import dynamic from 'next/dynamic';

const ControleEstoquePage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <ControleEstoquePage />;
}
