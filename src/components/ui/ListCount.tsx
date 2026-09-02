'use client';

interface ListCountProps {
  /** Quantos itens a página realmente carregou e está renderizando. */
  shown: number;
  /** Quantos existem no filtro atual, segundo `pagination.total` da API. */
  total: number;
  /** Substantivo já pluralizado, ex.: 'nota(s)', 'CT-e(s)', 'documento(s)'. */
  noun: string;
}

/**
 * Rodapé de contagem das listas fiscais.
 *
 * Auditoria b177b07 (QLMED-UI-001): as quatro listas fiscais pedem `limit=5000`
 * à API — que também tem teto de 5000 — e depois imprimiam `pagination.total`,
 * o número de documentos que EXISTEM no filtro. Com mais de 5000 no período, a
 * tela dizia "12345 nota(s)" logo abaixo de 5000 linhas renderizadas, sem nada
 * indicando que faltavam 7345. Numa lista fiscal isso não é um detalhe de UX:
 * o operador conclui que conferiu o período inteiro.
 *
 * Este componente é o único ponto onde a contagem é escrita, para que as quatro
 * listas não voltem a divergir uma da outra.
 */
export default function ListCount({ shown, total, noun }: ListCountProps) {
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
