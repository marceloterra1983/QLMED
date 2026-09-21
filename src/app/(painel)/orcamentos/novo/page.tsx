'use client';

import dynamic from 'next/dynamic';

const Editor = dynamic(() => import('../OrcamentoEditor'), { ssr: false });

export default function Page() {
  return <Editor />;
}
