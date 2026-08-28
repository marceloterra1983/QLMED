import { getCfopTagByCode } from '@/lib/cfop';
import { sumMoney } from '@/lib/money';

export const ISSUED_SUMMARY_NON_SALE_SUFFIX = ' (CONSIG.)';

export type IssuedSummaryInvoiceInput = {
  number?: string | null;
  totalValue?: number | string | null;
  cfop?: string | null;
  cfopTag?: string | null;
  cancelledAt?: string | Date | null;
};

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

function hasCancellationMark(cancelledAt?: string | Date | null): boolean {
  return cancelledAt != null && cancelledAt !== '';
}

function invoiceAmount(value: number | string | null | undefined): number {
  if (value == null || value === '') return 0;
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function isIssuedSaleForHeader(invoice: IssuedSummaryInvoiceInput): boolean {
  if (hasCancellationMark(invoice.cancelledAt)) return false;
  return isIssuedSaleOperation(invoice.cfop, invoice.cfopTag);
}

export function summarizeIssuedDailySalesHeader(
  invoices: IssuedSummaryInvoiceInput[],
): { saleCount: number; saleTotal: number } {
  const sales = invoices.filter(isIssuedSaleForHeader);
  return {
    saleCount: sales.length,
    saleTotal: sumMoney(sales.map((invoice) => invoiceAmount(invoice.totalValue))),
  };
}

export function formatIssuedSummarySalesHeaderLines(saleCount: number, saleTotalText: string): string {
  return `*Notas de venda:* ${saleCount}\n*Valor de vendas:* ${saleTotalText}`;
}
