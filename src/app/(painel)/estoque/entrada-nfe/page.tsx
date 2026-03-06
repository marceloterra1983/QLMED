import dynamic from 'next/dynamic';

const EntradaNfePage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <EntradaNfePage />;
}
