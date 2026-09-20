'use client';

interface ListPaginationProps {
  page: number;
  pages: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
}

export default function ListPagination({
  page,
  pages,
  loading = false,
  onPageChange,
}: ListPaginationProps) {
  if (pages <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={loading || page <= 1}
        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40"
      >
        Anterior
      </button>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(pages, page + 1))}
        disabled={loading || page >= pages}
        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40"
      >
        Próxima
      </button>
    </div>
  );
}
