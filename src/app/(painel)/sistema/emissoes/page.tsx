'use client';

import dynamic from 'next/dynamic';

const EmissoesHubPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <EmissoesHubPage />;
}
