import { z } from 'zod';
import { assertAllowedHost } from '@/lib/http-allowlist';
import { RECEITA_NFSE_ALLOWED_HOSTS } from '@/lib/receita-nfse-client';

/**
 * `baseUrl` override do ADN.
 *
 * Era `z.string()` — qualquer texto — e seguia para um `https.request` que
 * apresenta o certificado de cliente do e-CNPJ. Vazio/ausente continua
 * significando "usar o host padrão do ambiente"; qualquer valor explícito
 * agora tem de ser um dos hosts do ADN.
 */
const receitaBaseUrlSchema = z
  .string()
  .optional()
  .nullable()
  .refine(
    (value) => {
      if (value === undefined || value === null || value.trim() === '') return true;
      try {
        assertAllowedHost(value, RECEITA_NFSE_ALLOWED_HOSTS);
        return true;
      } catch {
        return false;
      }
    },
    { message: `baseUrl deve ser https em um dos hosts do ADN: ${RECEITA_NFSE_ALLOWED_HOSTS.join(', ')}` },
  );

/**
 * Schema para POST /api/receita/nfse/config
 * Salva configuracao Receita NFS-e.
 */
export const receitaNfseConfigSchema = z.object({
  apiToken: z.string().optional().nullable(),
  autoSync: z.boolean().optional().default(true),
  syncInterval: z.coerce.number().int().positive().optional().default(60),
  environment: z.enum(['production', 'production-restricted']).optional().default('production'),
  baseUrl: receitaBaseUrlSchema,
  cnpjConsulta: z.string().optional().nullable(),
});

/**
 * Schema para PUT /api/receita/nfse/config
 * Testa conexao com a API Receita NFS-e.
 */
export const receitaNfseTestSchema = z.object({
  apiToken: z.string().optional().nullable(),
  environment: z.enum(['production', 'production-restricted']).optional().default('production'),
  baseUrl: receitaBaseUrlSchema,
  cnpjConsulta: z.string().optional().nullable(),
});

/**
 * Schema para POST /api/access-log
 * Registra log de acesso.
 */
export const accessLogSchema = z.object({
  action: z.enum(['login', 'navigation'], {
    error: 'action deve ser login ou navigation',
  }),
  path: z.string().optional().nullable(),
});
