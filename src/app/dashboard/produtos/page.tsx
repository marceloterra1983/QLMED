'use client';

export default function ProdutosPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Produtos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerencie seus produtos cadastrados
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
        <span className="material-symbols-outlined text-[48px] text-slate-300 dark:text-slate-600">inventory_2</span>
        <p className="mt-4 text-slate-500 dark:text-slate-400">Nenhum produto cadastrado ainda.</p>
      </div>
    </div>
  );
}
