import { z } from 'zod';

export type FiscalPeriod = 'month' | 'quarter' | 'year';

/**
 * Schema compartilhado do filtro de período das telas fiscais.
 *
 * Existe para que toda rota que responde ao mesmo seletor de período aceite
 * exatamente os mesmos parâmetros. A rota `by-cfop` aceitava só `year` e por
 * isso devolvia o ano inteiro enquanto os cards da mesma tela mostravam o
 * trimestre escolhido — dois números discordando lado a lado.
 */
export const fiscalPeriodQuerySchema = z.object({
  period: z.enum(['month', 'quarter', 'year']).default('year'),
  year: z.coerce.number().int().min(2000).max(2100).default(() => new Date().getFullYear()),
  month: z.coerce.number().int().min(1).max(12).default(() => new Date().getMonth() + 1),
});

/**
 * Intervalo [startDate, endDate] de um período fiscal, em UTC.
 *
 * Fonte única: qualquer rota que filtre por período deve chamar esta função em
 * vez de recalcular o intervalo, senão as telas voltam a divergir.
 *
 * No modo `quarter`, o trimestre é o que contém `month` — então o cliente
 * precisa mandar um mês daquele trimestre (1/4/7/10 servem como âncora).
 */
export function getFiscalPeriodRange(
  period: FiscalPeriod,
  year: number,
  month: number,
): { startDate: Date; endDate: Date } {
  if (period === 'month') {
    return {
      startDate: new Date(Date.UTC(year, month - 1, 1)),
      endDate: new Date(Date.UTC(year, month, 0, 23, 59, 59)),
    };
  }

  if (period === 'quarter') {
    const quarter = Math.ceil(month / 3);
    return {
      startDate: new Date(Date.UTC(year, (quarter - 1) * 3, 1)),
      endDate: new Date(Date.UTC(year, quarter * 3, 0, 23, 59, 59)),
    };
  }

  return {
    startDate: new Date(Date.UTC(year, 0, 1)),
    endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
  };
}

/** NF-e no conjunto vs quantas têm invoice_tax_totals. Período vazio = 0, não all-time. */
export function nfeTaxCoverage(
  invoices: { id: string; type: string }[],
  taxInvoiceIds: Iterable<string>,
): { totalNfe: number; withTaxData: number } {
  const tax = new Set(taxInvoiceIds);
  const nfeIds = invoices.filter((i) => i.type === 'NFE').map((i) => i.id);
  return {
    totalNfe: nfeIds.length,
    withTaxData: nfeIds.filter((id) => tax.has(id)).length,
  };
}
