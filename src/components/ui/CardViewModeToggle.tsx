'use client';

export type CardViewMode = 'popup' | 'expand';

interface CardViewModeToggleProps {
  mode: CardViewMode;
  onChange: (mode: CardViewMode) => void;
  className?: string;
}

export default function CardViewModeToggle({ mode, onChange, className = '' }: CardViewModeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Modo de visualização dos cards"
      className={`inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 ${className}`}
    >
      <button
        type="button"
        role="button"
        aria-pressed={mode === 'popup'}
        aria-label="Abrir card em popup"
        onClick={() => onChange('popup')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors ${
          mode === 'popup'
            ? 'bg-white dark:bg-card-dark text-primary dark:text-blue-400 shadow-sm font-bold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
        }`}
        title="Ao clicar em um card, abrir em popup (modo padrão)"
      >
        <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
          open_in_new
        </span>
        <span className="hidden sm:inline">Abrir em popup</span>
        <span className="sm:hidden">Popup</span>
      </button>

      <button
        type="button"
        role="button"
        aria-pressed={mode === 'expand'}
        aria-label="Expandir cards dentro do modal"
        onClick={() => onChange('expand')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors ${
          mode === 'expand'
            ? 'bg-white dark:bg-card-dark text-primary dark:text-blue-400 shadow-sm font-bold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
        }`}
        title="Ao clicar em um card, expandir dentro deste modal"
      >
        <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
          unfold_more
        </span>
        <span className="hidden sm:inline">Expandir no modal</span>
        <span className="sm:hidden">Expandir</span>
      </button>
    </div>
  );
}
