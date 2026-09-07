/**
 * SPEC-058 — corte temporal e resolução de código Spica nas entradas.
 * Funções puras: testáveis sem Prisma.
 */

export const STOCK_LEDGER_CUTOFF = new Date('2021-01-01T00:00:00.000Z');

export function isOnOrAfterStockCutoff(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() >= STOCK_LEDGER_CUTOFF.getTime();
}

export type ReceivedStockKind = 'ENTRADA_NFE' | 'RETORNO_CONSIG';

/** Compra/entrada → CD. Retorno de consignação recebido → sai do cliente e volta ao CD. */
export function classifyReceivedStockCfop(cfop: string | null | undefined): {
  kind: ReceivedStockKind;
  isReturn: boolean;
} {
  const code = (cfop ?? '').trim();
  if (['1918', '2918', '5916', '6916', '1916', '2916'].includes(code)) {
    return { kind: 'RETORNO_CONSIG', isReturn: true };
  }
  return { kind: 'ENTRADA_NFE', isReturn: false };
}

export function resolveReceivedProductCodigo(input: {
  supplierCode: string;
  itemNumber?: number | null;
  linkByItem: ReadonlyMap<number, string>;
  linkBySupplier: ReadonlyMap<string, string>;
  registryByCode: ReadonlyMap<string, string>;
}): string {
  const item = input.itemNumber;
  if (item != null && input.linkByItem.has(item)) {
    const matched = input.linkByItem.get(item)?.trim();
    if (matched) return matched;
  }
  const code = (input.supplierCode || '').trim();
  if (!code) return code;
  const fromSupplier = input.linkBySupplier.get(code)?.trim();
  if (fromSupplier) return fromSupplier;
  const fromRegistry = input.registryByCode.get(code)?.trim();
  if (fromRegistry) return fromRegistry;
  return code;
}

export const FISCAL_STOCK_KINDS = [
  'ENTRADA_NFE',
  'SAIDA_NFE',
  'REMESSA_CONSIG',
  'RETORNO_CONSIG',
] as const;
