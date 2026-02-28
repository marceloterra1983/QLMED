import dynamic from 'next/dynamic';

const DashboardPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <DashboardPage />;
}
