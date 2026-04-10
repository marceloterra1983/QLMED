import { z } from 'zod';

/**
 * Schema para POST /api/nsdocs/config
 * Salva configuracao NSDocs (token da API).
 */
export const nsdocsConfigSchema = z.object({
  apiToken: z.string().min(1, 'apiToken e obrigatorio'),
  autoSync: z.boolean().optional().default(true),
  syncInterval: z.number().int().positive().optional().default(60),
});

/**
 * Schema para PUT /api/nsdocs/config
 * Testa conexao com a API NSDocs.
 */
export const nsdocsTestSchema = z.object({
  apiToken: z.string().min(1, 'apiToken e obrigatorio'),
});

/**
 * Schema para POST /api/nsdocs/import-period
 * Importa documentos NSDocs de um periodo.
 */
export const importPeriodSchema = z.object({
  startDate: z.string().min(1, 'startDate e obrigatorio'),
  endDate: z.string().min(1, 'endDate e obrigatorio'),
});

/**
 * Schema para POST /api/nsdocs/sync
 * Inicia sincronizacao via metodo especificado.
 */
export const nsdocsSyncSchema = z.object({
  method: z.enum(['sefaz', 'nsdocs', 'receita_nfse']).optional(),
});
