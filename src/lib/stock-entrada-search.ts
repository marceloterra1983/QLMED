/**
 * SPEC-060 — fallback da busca da Entrada NF-e: se emitente/número não casam,
 * devolve as notas já carregadas cujo id aparece em movimentos do lote.
 */
export function resolveEntradaNfeSearchHits<T extends { id: string }>(
  textMatches: T[],
  candidates: T[],
  lotLinkedInvoiceIds: Iterable<string>,
): T[] {
  if (textMatches.length > 0) return textMatches;
  const ids = new Set(lotLinkedInvoiceIds);
  return candidates.filter((inv) => ids.has(inv.id));
}
