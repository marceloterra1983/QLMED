import { z } from 'zod';

const RECEITA_NFSE_HOSTS = {
  production: 'adn.nfse.gov.br',
  'production-restricted': 'adn.producaorestrita.nfse.gov.br',
} as const;

function isAllowedReceitaNfseBaseUrl(
  value: string | null | undefined,
  environment: keyof typeof RECEITA_NFSE_HOSTS,
): boolean {
  const raw = value?.trim();
  if (!raw) return true;

  try {
    const url = new URL(raw);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      url.hostname === RECEITA_NFSE_HOSTS[environment] &&
      /^\/contribuintes\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function withReceitaNfseBaseUrlValidation<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((data: z.infer<T>, ctx) => {
    const config = data as {
      baseUrl?: string | null;
      environment?: keyof typeof RECEITA_NFSE_HOSTS;
    };
    if (!isAllowedReceitaNfseBaseUrl(config.baseUrl, config.environment || 'production')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseUrl'],
        message: 'baseUrl deve ser HTTPS e apontar para o host oficial da Receita NFS-e do ambiente selecionado',
      });
    }
  });
}

/**
 * Schema para POST /api/receita/nfse/config
 * Salva configuracao Receita NFS-e.
 */
export const receitaNfseConfigSchema = withReceitaNfseBaseUrlValidation(z.object({
  apiToken: z.string().optional().nullable(),
  autoSync: z.boolean().optional().default(true),
  syncInterval: z.coerce.number().int().positive().optional().default(60),
  environment: z.enum(['production', 'production-restricted']).optional().default('production'),
  baseUrl: z.string().trim().optional().nullable(),
  cnpjConsulta: z.string().optional().nullable(),
}));

/**
 * Schema para PUT /api/receita/nfse/config
 * Testa conexao com a API Receita NFS-e.
 */
export const receitaNfseTestSchema = withReceitaNfseBaseUrlValidation(z.object({
  apiToken: z.string().optional().nullable(),
  environment: z.enum(['production', 'production-restricted']).optional().default('production'),
  baseUrl: z.string().trim().optional().nullable(),
  cnpjConsulta: z.string().optional().nullable(),
}));

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
