import type { ReactNode } from 'react';

/**
 * Estado vazio. Havia 39 "Nenhum…" à mão em 24 ficheiros — uns com ícone,
 * uns sem, uns em 48px, uns em 12px, quase nenhum com o que fazer a seguir.
 *
 * A dica diz o que mudar (ampliar o intervalo, limpar o filtro); a ação é
 * opcional e sempre secundária — um estado vazio não é um convite a criar.
 */
type EmptyStateProps = {
  /** Glifo Material Symbols. */
  icon: string;
  title: string;
  hint?: string;
  /** Normalmente `<Button variant="secondary" size="sm">`. */
  action?: ReactNode;
  /** Dentro de célula de tabela ou cartão pequeno. */
  compact?: boolean;
  className?: string;
};

export default function EmptyState({ icon, title, hint, action, compact, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center text-center gap-2 ${compact ? 'py-6' : 'py-10'} ${className ?? ''}`}
    >
      <span
        aria-hidden="true"
        className={`flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 ${compact ? 'w-10 h-10' : 'w-13 h-13'}`}
      >
        <span className={`material-symbols-outlined text-slate-500 dark:text-slate-400 ${compact ? 'text-[20px]' : 'text-[26px]'}`}>
          {icon}
        </span>
      </span>
      <p className={`font-bold text-slate-700 dark:text-slate-200 ${compact ? 'text-sm' : 'text-base'}`}>{title}</p>
      {hint ? <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
