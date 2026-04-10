import { z } from 'zod';

/**
 * Schema para POST /api/estoque/entrada-nfe
 * Registra entrada de NF-e no estoque.
 */
export const entradaNfeSchema = z.object({
  invoiceId: z.string().min(1, 'invoiceId e obrigatorio'),
  lotOverrides: z.record(z.string(), z.array(z.object({
    lot: z.string().default(''),
    expiry: z.string().nullable().optional(),
    quantity: z.number().nullable().optional(),
  }))).optional(),
});

/**
 * Schema para PATCH /api/estoque/entrada-nfe/[invoiceId]
 * Atualiza lote de um item de entrada.
 */
export const entradaNfeUpdateLotSchema = z.object({
  itemId: z.coerce.number({ required_error: 'itemId e obrigatorio' }),
  lot: z.string().nullable().optional(),
  lotExpiry: z.string().nullable().optional(),
  lotQuantity: z.coerce.number().nullable().optional(),
});

/**
 * Schema para POST /api/estoque/entrada-nfe/[invoiceId]
 * Clona um item de entrada para adicionar novo lote.
 */
export const entradaNfeCloneBatchSchema = z.object({
  sourceItemId: z.coerce.number({ required_error: 'sourceItemId e obrigatorio' }),
  lot: z.string().min(1, 'lot e obrigatorio'),
  lotExpiry: z.string().nullable().optional(),
  lotQuantity: z.coerce.number().nullable().optional(),
});
