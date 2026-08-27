import { getCfopTagByCode } from '@/lib/cfop';

export const ISSUED_SUMMARY_NON_SALE_SUFFIX = ' (CONSIG.)';

export function isIssuedSaleOperation(cfop?: string | null, cfopTag?: string | null): boolean {
  const tag = cfopTag ?? getCfopTagByCode(cfop);
  return tag === 'Venda';
}

export function issuedSummaryValueSuffix(cfop?: string | null, cfopTag?: string | null): string {
  return isIssuedSaleOperation(cfop, cfopTag) ? '' : ISSUED_SUMMARY_NON_SALE_SUFFIX;
}

export function formatIssuedSummaryAmountLine(amountText: string, cfop?: string | null, cfopTag?: string | null): string {
  return `${amountText}${issuedSummaryValueSuffix(cfop, cfopTag)}`;
}
