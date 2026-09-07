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
  itemId: z.coerce.number({ error: 'itemId e obrigatorio' }),
  lot: z.string().nullable().optional(),
  lotExpiry: z.string().nullable().optional(),
  lotQuantity: z.coerce.number().nullable().optional(),
});

/**
 * Schema para POST /api/estoque/entrada-nfe/[invoiceId]
 * Clona um item de entrada para adicionar novo lote.
 */
export const entradaNfeCloneBatchSchema = z.object({
  sourceItemId: z.coerce.number({ error: 'sourceItemId e obrigatorio' }),
  lot: z.string().min(1, 'lot e obrigatorio'),
  lotExpiry: z.string().nullable().optional(),
  lotQuantity: z.coerce.number().nullable().optional(),
});

/**
 * Schema para POST /api/estoque/controle/ajuste
 * Perda por validade ou ajuste manual de saldo.
 */
export const estoqueAjusteSchema = z.object({
  productCodigo: z.string().min(1, 'productCodigo e obrigatorio'),
  productName: z.string().nullable().optional(),
  lot: z.string().default(''),
  lotExpiry: z.string().nullable().optional(),
  quantity: z.coerce.number().positive('quantity deve ser positiva'),
  kind: z.enum(['PERDA_VALIDADE', 'AJUSTE']),
  direction: z.enum(['IN', 'OUT']),
  locationType: z.enum(['CD', 'CUSTOMER']),
  locationCnpj: z.string().nullable().optional(),
  locationName: z.string().nullable().optional(),
  reason: z.string().min(1, 'reason e obrigatorio'),
});

/**
 * Query params GET /api/estoque/controle/saldos
 */
export const estoqueSaldosQuerySchema = z.object({
  q: z.string().optional(),
  locationType: z.enum(['CD', 'CUSTOMER', 'ALL']).optional(),
  validity: z.enum(['vencido', 'd30', 'd90', 'ok', 'sem_validade', 'ALL']).optional(),
  limit: z.coerce.number().int().positive().max(2000).optional(),
});

/**
 * Query params GET /api/estoque/controle/movimentos
 */
export const estoqueMovimentosQuerySchema = z.object({
  productCodigo: z.string().optional(),
  lot: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});



/**
 * Query GET /api/estoque/saida-material/saldos
 */
export const saidaMaterialSaldosQuerySchema = z.object({
  q: z.string().optional(),
  locationType: z.enum(['CD', 'CUSTOMER']).optional(),
  locationCnpj: z.string().optional(),
  limit: z.coerce.number().int().positive().max(2000).optional(),
});

/**
 * Query GET /api/estoque/saida-material/clientes
 */
export const saidaMaterialClientesQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

/**
 * POST /api/estoque/saida-material/checklist
 */
export const saidaMaterialChecklistSchema = z.object({
  tab: z.enum(['consignado', 'saida_avulsa', 'venda_direta', 'material_usado']),
  customerCnpj: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  items: z.array(z.object({
    productCodigo: z.string().min(1),
    productName: z.string().nullable().optional(),
    lot: z.string().default(''),
    lotExpiry: z.string().nullable().optional(),
    quantity: z.coerce.number().positive(),
  })).min(1).max(200),
  mode: z.enum(['checklist', 'avulsa_movimento']),
});
