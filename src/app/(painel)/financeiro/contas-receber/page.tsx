import dynamic from 'next/dynamic';

const ContasReceberPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <ContasReceberPage />;
}
