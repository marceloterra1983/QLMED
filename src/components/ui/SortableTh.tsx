import type { ReactNode } from 'react';

/**
 * Cabeçalho de coluna ordenável. Havia 39 `<th onClick>` em 8 ficheiros: o
 * mouse ordenava, o teclado não chegava lá (um `<th>` não recebe foco), e
 * nenhum dizia ao leitor de tela por onde a tabela estava ordenada.
 *
 * Aqui o clique vive num `<button>` dentro do `<th>` — foco, Enter e Espaço
 * de graça — e o `<th>` carrega `aria-sort` quando é a coluna ativa.
 */
export type SortDirection = 'asc' | 'desc';

type SortableThProps = {
  /** Chave desta coluna. */
  col: string;
  /** Chave da coluna ordenada agora. */
  sortBy: string;
  sortOrder: SortDirection;
  onSort: (col: string) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
  children: ReactNode;
};

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
const JUSTIFY = { left: 'justify-start', right: 'justify-end', center: 'justify-center' } as const;

export default function SortableTh({ col, sortBy, sortOrder, onSort, align = 'left', className, children }: SortableThProps) {
  const ativa = sortBy === col;
  return (
    <th
      scope="col"
      aria-sort={ativa ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`p-0 ${ALIGN[align]} ${className ?? ''}`}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        // O padding vive no botão, não na célula: assim o alvo de clique/toque é a
        // célula inteira (44px), não uma linha de texto de 24px no meio dela.
        className={`group flex items-center gap-1 w-full px-4 py-3 ${JUSTIFY[align]} text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors`}
      >
        {children}
        <span
          aria-hidden="true"
          className={`material-symbols-outlined text-[16px] print:hidden ${ativa ? 'text-primary dark:text-blue-400' : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400'}`}
        >
          {ativa ? (sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
        </span>
      </button>
    </th>
  );
}
