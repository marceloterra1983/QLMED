import dynamic from 'next/dynamic';

const UsuariosPage = dynamic(() => import('./page-client'), { ssr: false });

export default function Page() {
  return <UsuariosPage />;
}
