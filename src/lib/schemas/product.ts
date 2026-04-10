import { z } from 'zod';

/**
 * Schema para PATCH /api/products/anvisa
 * Atualiza dados ANVISA de um produto individual.
 */
export const anvisaPatchSchema = z.object({
  productKey: z.string().min(1, 'productKey e obrigatorio'),
  description: z.string().min(1, 'description e obrigatorio'),
  anvisa: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  ncm: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  ean: z.string().optional().nullable(),
});

/**
 * Schema para POST /api/products/anvisa/bulk-import
 * Importa codigos ANVISA em lote a partir de planilha.
 */
export const anvisaBulkImportSchema = z.object({
  items: z
    .array(
      z.object({
        codigo: z.string().min(1, 'codigo e obrigatorio'),
        anvisa: z.string().min(1, 'anvisa e obrigatorio'),
        fabricante: z.string().optional(),
      })
    )
    .min(1, 'items deve ser array nao-vazio')
    .max(10000, 'Maximo de 10.000 itens por importacao'),
});

/**
 * Schema para POST /api/products/anvisa/sync-registry
 * Sincroniza dados ANVISA de produtos com a API da ANVISA.
 */
export const anvisaSyncRegistrySchema = z.object({
  mode: z.enum(['all', 'selected']).optional().default('all'),
  productKeys: z.array(z.string()).optional().default([]),
});

/**
 * Schema para POST /api/products/anvisa/upload-opendata
 * Upload de dados ANVISA via base OpenData.
 */
export const anvisaUploadOpendataSchema = z.object({
  items: z
    .array(
      z.object({
        registration: z.string().optional().default(''),
        nomeProduto: z.string().optional().nullable(),
        nomeEmpresa: z.string().optional().nullable(),
        processo: z.string().optional().nullable(),
        situacao: z.string().optional().nullable(),
        vencimento: z.string().optional().nullable(),
        classeRisco: z.string().optional().nullable(),
        nomeFabricante: z.string().optional().nullable(),
        paisFabricante: z.string().optional().nullable(),
      })
    )
    .min(1, 'Nenhum item recebido')
    .max(200000, 'Maximo de 200.000 itens por envio'),
});

/**
 * Schema para POST /api/products/auto-classify
 * Classifica produtos automaticamente com base em heuristicas.
 */
export const autoClassifySchema = z.object({
  dryRun: z.boolean().optional().default(false),
});

/**
 * Schema para PATCH /api/products/bulk-update
 * Atualiza campos de multiplos produtos.
 */
export const bulkUpdateSchema = z.object({
  products: z
    .array(
      z.object({
        productKey: z.string().min(1, 'productKey e obrigatorio'),
        code: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        ncm: z.string().optional().nullable(),
        unit: z.string().optional().nullable(),
        ean: z.string().optional().nullable(),
      })
    )
    .min(1, 'products e obrigatorio')
    .max(500, 'Maximo de 500 produtos'),
  fields: z.record(z.unknown()).refine((v) => Object.keys(v).length > 0, {
    message: 'Nenhum campo para atualizar',
  }),
});

/**
 * Schema para POST /api/products/rename-fiscal
 * Renomeia ou adiciona valores fiscais no catalogo.
 */
const VALID_FISCAL_FIELDS = [
  'ncm', 'fiscalSitTributaria', 'fiscalNomeTributacao', 'cest',
  'origem', 'cfopEntrada', 'cfopSaida', 'obsIcms', 'obsPisCofins',
  'aliqIcms', 'aliqPis', 'aliqCofins', 'aliqIpi', 'aliqFcp',
] as const;

export const renameFiscalSchema = z.object({
  action: z.string().optional(),
  field: z.enum(VALID_FISCAL_FIELDS, {
    errorMap: () => ({ message: `field deve ser: ${VALID_FISCAL_FIELDS.join(', ')}` }),
  }),
  oldValue: z.string().optional(),
  newValue: z.union([z.string(), z.null()]).optional(),
  name: z.string().optional(),
});

/**
 * Schema para POST /api/products/rename-manufacturer
 * Renomeia, exclui ou adiciona fabricantes no catalogo.
 */
export const renameManufacturerSchema = z.object({
  action: z.enum(['rename', 'delete', 'shortName', 'add'], {
    errorMap: () => ({ message: 'action deve ser rename, delete, shortName ou add' }),
  }),
  oldValue: z.string().optional(),
  newValue: z.string().optional(),
  manufacturer: z.string().optional(),
  shortName: z.union([z.string(), z.null()]).optional(),
  name: z.string().optional(),
});

/**
 * Schema para POST /api/products/rename-type
 * Renomeia ou adiciona linhas/grupos/subgrupos.
 */
export const renameTypeSchema = z.object({
  action: z.string().optional(),
  field: z.string().optional(),
  oldValue: z.string().optional(),
  newValue: z.union([z.string(), z.null()]).optional(),
  parentType: z.string().optional(),
  parentSubtype: z.string().optional(),
  name: z.string().optional(),
  subtypeName: z.string().optional(),
  subgroupName: z.string().optional(),
});

/**
 * Schema para POST /api/products/sync-anvisa
 * Sincroniza codigos ANVISA de todos os produtos com a API de produtos.
 */
export const syncAnvisaSchema = z.object({
  mode: z.enum(['all', 'missing']).optional().default('missing'),
});
