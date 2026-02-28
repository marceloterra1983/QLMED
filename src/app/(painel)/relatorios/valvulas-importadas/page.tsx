import dynamic from 'next/dynamic';

const ValvulasImportadasPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <ValvulasImportadasPage />;
}
