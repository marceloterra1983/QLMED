import { z } from 'zod';

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
