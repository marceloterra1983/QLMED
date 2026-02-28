import dynamic from 'next/dynamic';

const CompaniesPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <CompaniesPage />;
}
