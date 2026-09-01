import Button from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/20 p-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <span className="material-symbols-outlined text-[80px] text-slate-300 dark:text-slate-600">search_off</span>
        </div>
        <h1 className="text-6xl font-extrabold text-slate-900 dark:text-white mb-2">404</h1>
        <p className="text-lg font-semibold text-slate-600 dark:text-slate-300 mb-1">Página não encontrada</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
          O endereço que você acessou não existe ou foi movido.
        </p>
        <Button href="/fiscal/invoices" icon="home" size="lg">
          Voltar ao início
        </Button>
      </div>
    </div>
  );
}
