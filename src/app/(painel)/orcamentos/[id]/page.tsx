'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const Editor = dynamic(() => import('../OrcamentoEditor'), { ssr: false });

export default function Page() {
  const params = useParams<{ id: string }>();
  return <Editor quoteId={params.id} />;
}
