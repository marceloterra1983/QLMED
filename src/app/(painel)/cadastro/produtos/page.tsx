import dynamic from 'next/dynamic';

const ProdutosPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <ProdutosPage />;
}
