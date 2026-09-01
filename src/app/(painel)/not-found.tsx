import Button from '@/components/ui/Button';

export default function DashboardNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <span className="material-symbols-outlined text-[64px] text-slate-300 dark:text-slate-600 mb-4">search_off</span>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Página não encontrada</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Essa seção não existe ou foi removida.</p>
      <Button href="/fiscal/invoices" icon="dashboard">
        Voltar ao painel
      </Button>
    </div>
  );
}
