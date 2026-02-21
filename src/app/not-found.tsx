import Link from 'next/link';

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
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-primary/30 hover:shadow-lg"
        >
          <span className="material-symbols-outlined text-[18px]">home</span>
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
