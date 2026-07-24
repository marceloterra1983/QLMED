import { z } from 'zod';

const isoDateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Data invalida');

function intQuery(defaultValue: number, min: number, max: number) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'string') return Number(value);
    return value;
  }, z.number().int().min(min).max(max));
}

function stringQuery(defaultValue = '', max = 200) {
  return z.preprocess((value) => {
    if (value === undefined || value === null) return defaultValue;
    return String(value).trim();
  }, z.string().max(max));
}

/**
 * Schema para GET /api/financeiro/contas-pagar|receber.
 */
export const financeiroListQuerySchema = z.object({
  page: intQuery(1, 1, 100000),
  limit: intQuery(50, 1, 2000),
  search: stringQuery('', 200),
  status: z.enum(['', 'all', 'overdue', 'due_today', 'due_soon', 'upcoming']).optional().default(''),
  dateFrom: z.union([isoDateString, z.literal('')]).optional().default(''),
  dateTo: z.union([isoDateString, z.literal('')]).optional().default(''),
  sort: z.enum(['vencimento', 'valor', 'emitente', 'cliente', 'nfNumero', 'status']).optional().default('vencimento'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
}).superRefine((data, ctx) => {
  if (data.dateFrom && data.dateTo && data.dateFrom > data.dateTo) {
    ctx.addIssue({
      code: 'custom',
      path: ['dateTo'],
      message: 'dateTo deve ser maior ou igual a dateFrom',
    });
  }
});

/**
 * Schema para uma parcela individual no PUT de installments.
 */
const installmentItemSchema = z.object({
  dupNumero: z.string().optional(),
  dupVencimento: z.string().min(1, 'Vencimento e obrigatorio'),
  dupValor: z.coerce.number().nonnegative('Valor deve ser positivo'),
});

/**
 * Schema para PUT /api/financeiro/contas-pagar|receber/invoice/[invoiceId]/installments
 * Salva parcelas de uma nota fiscal.
 */
export const installmentsSchema = z.object({
  installments: z
    .array(installmentItemSchema)
    .min(1, 'Informe ao menos uma parcela'),
});

/**
 * Schema para PATCH /api/financeiro/contas-pagar/override
 * Override de dados da duplicata para contas a pagar.
 */
export const overrideSchema = z.object({
  invoiceId: z.string().min(1, 'invoiceId e obrigatorio'),
  dupNumeroOriginal: z.string().min(1, 'dupNumeroOriginal e obrigatorio'),
  dupVencimentoOriginal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dupVencimentoOriginal deve estar no formato YYYY-MM-DD'),
  emitenteNome: z.string().max(255).optional().nullable(),
  emitenteCnpj: z.string().optional().nullable(),
  faturaNumero: z.string().max(100).optional().nullable(),
  dupNumero: z.string().max(100).optional().nullable(),
  dupVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Vencimento deve estar no formato YYYY-MM-DD').optional().nullable(),
  dupValor: z.union([z.coerce.number().nonnegative(), z.literal(''), z.null()]).optional(),
});
