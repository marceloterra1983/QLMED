/** Tamanho de página das listas fiscais (NF-e, CT-e, NFS-e). Intervalo contratado: 50–100. */
export const FISCAL_LIST_PAGE_SIZE = 50;

/** Tamanho de página das listas de contas a pagar/receber. Intervalo contratado: 50–100. */
export const FINANCEIRO_LIST_PAGE_SIZE = 50;

export type CountDecision = 'use-fetched' | 'query-count' | 'omit';

/**
 * COUNT só quando o total ainda não é óbvio.
 * - includeTotal=false: o cliente já tem o total da página 1 (navegação).
 * - página 1 incompleta: o comprimento da página é o total.
 */
export function shouldCountListTotal(input: {
  page: number;
  limit: number;
  fetchedCount: number;
  includeTotal: boolean;
}): CountDecision {
  if (!input.includeTotal) return 'omit';
  if (input.page === 1 && input.fetchedCount < input.limit) return 'use-fetched';
  return 'query-count';
}

/** Default true: clientes antigos e a página 1 continuam a receber total. */
export function parseIncludeTotal(value: string | null | undefined): boolean {
  if (value == null || value === '') return true;
  const normalized = value.trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'no';
}

export async function resolveListTotal(input: {
  page: number;
  limit: number;
  fetchedCount: number;
  includeTotal: boolean;
  count: () => Promise<number>;
}): Promise<{ total: number | null; pages: number | null }> {
  const decision = shouldCountListTotal(input);
  if (decision === 'omit') return { total: null, pages: null };
  const total = decision === 'use-fetched' ? input.fetchedCount : await input.count();
  return { total, pages: Math.ceil(total / input.limit) };
}

export function applyListPageParams(params: URLSearchParams, page: number, limit: number): void {
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (page > 1) params.set('includeTotal', '0');
}
