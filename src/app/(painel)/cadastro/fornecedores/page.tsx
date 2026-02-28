import dynamic from 'next/dynamic';

const SuppliersPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <SuppliersPage />;
}
