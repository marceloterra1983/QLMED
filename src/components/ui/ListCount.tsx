'use client';

interface ListCountProps {
  /** Quantos itens a página realmente carregou e está renderizando. */
  shown: number;
  /** Quantos existem no filtro atual, segundo `pagination.total` da API. */
  total: number;
  /** Substantivo já pluralizado, ex.: 'nota(s)', 'CT-e(s)', 'documento(s)'. */
  noun: string;
  page?: number;
  pages?: number;
  pageSize?: number;
}

/**
 * Rodapé de contagem das listas fiscais.
 *
 * Auditoria b177b07 (QLMED-UI-001): as quatro listas fiscais pediam `limit=5000`
 * e imprimiam `pagination.total` como se a tela tivesse o período inteiro.
 * SPEC-077 pagina de verdade; o aviso de truncamento fica só para o residual
 * do teto da API, quando não há metadados de página.
 *
 * Este componente é o único ponto onde a contagem é escrita, para que as quatro
 * listas não voltem a divergir uma da outra.
 */
export default function ListCount({
  shown,
  total,
  noun,
  page,
  pages,
  pageSize,
}: ListCountProps) {
  const paginated = Boolean(page && pages && pages > 1 && pageSize && pageSize > 0);

  if (paginated && page && pages && pageSize) {
    const from = shown === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = (page - 1) * pageSize + shown;
    return (
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {shown === 0
          ? `0 de ${total} ${noun}`
          : `${from}–${to} de ${total} ${noun}`}
        {' · '}página {page} de {pages}
      </span>
    );
  }

  if (total > shown) {
    return (
      <span
        role="status"
        className="text-xs font-medium text-amber-700 dark:text-amber-300"
      >
        {shown} de {total} {noun} — lista truncada, refine o filtro
      </span>
    );
  }

  return <span className="text-xs text-slate-500">{total} {noun}</span>;
}
