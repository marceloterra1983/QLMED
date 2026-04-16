import { createLogger } from '@/lib/logger';

const log = createLogger('env');

const required = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'ENCRYPTION_KEY',
  // Required: the middleware now fails closed if this is missing at the edge,
  // so startup must reject missing values too (otherwise the app boots but
  // every x-api-key request returns 500 until operators notice).
  'QLMED_API_KEY',
] as const;

const optional = [
  'TENANT_ID',
  'CLIENT_ID',
  'CLIENT_SECRET',
  'REDIRECT_URI',
  'RECEITA_NFSE_VERIFY_SSL',
] as const;

export function validateEnv() {
  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]?.trim()) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    log.error({ missing }, 'Variaveis de ambiente obrigatorias nao configuradas');
    process.exit(1);
  }

  const missingOptional = optional.filter(k => !process.env[k]?.trim());
  if (missingOptional.length > 0) {
    log.debug({ missing: missingOptional }, 'Variaveis opcionais nao configuradas');
  }
}
