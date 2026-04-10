'use client';

import dynamic from 'next/dynamic';

const UploadPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <UploadPage />;
}