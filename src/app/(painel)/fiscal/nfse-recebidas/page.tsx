'use client';

import dynamic from 'next/dynamic';

const NfseReceivedPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <NfseReceivedPage />;
}