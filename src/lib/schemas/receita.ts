import { z } from 'zod';

/**
 * Schema para POST /api/receita/nfse/config
 * Salva configuracao Receita NFS-e.
 */
export const receitaNfseConfigSchema = z.object({
  apiToken: z.string().optional().nullable(),
  autoSync: z.boolean().optional().default(true),
  syncInterval: z.coerce.number().int().positive().optional().default(60),
  environment: z.enum(['production', 'production-restricted']).optional().default('production'),
  baseUrl: z.string().optional().nullable(),
  cnpjConsulta: z.string().optional().nullable(),
});

/**
 * Schema para PUT /api/receita/nfse/config
 * Testa conexao com a API Receita NFS-e.
 */
export const receitaNfseTestSchema = z.object({
  apiToken: z.string().optional().nullable(),
  environment: z.enum(['production', 'production-restricted']).optional().default('production'),
  baseUrl: z.string().optional().nullable(),
  cnpjConsulta: z.string().optional().nullable(),
});

/**
 * Schema para POST /api/access-log
 * Registra log de acesso.
 */
export const accessLogSchema = z.object({
  action: z.enum(['login', 'navigation'], {
    errorMap: () => ({ message: 'action deve ser login ou navigation' }),
  }),
  path: z.string().optional().nullable(),
});
