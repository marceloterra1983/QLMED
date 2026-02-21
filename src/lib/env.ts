const required = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'ENCRYPTION_KEY',
] as const;

const optional = [
  'TENANT_ID',
  'CLIENT_ID',
  'CLIENT_SECRET',
  'REDIRECT_URI',
] as const;

export function validateEnv() {
  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]?.trim()) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error(
      `\n[QLMED] Variáveis de ambiente obrigatórias não configuradas:\n` +
      missing.map(k => `  - ${k}`).join('\n') +
      `\n\nVerifique seu arquivo .env ou as variáveis de ambiente do container.\n`
    );
    process.exit(1);
  }

  const missingOptional = optional.filter(k => !process.env[k]?.trim());
  if (missingOptional.length > 0) {
    console.warn(
      `[QLMED] Variáveis opcionais não configuradas: ${missingOptional.join(', ')} — algumas integrações podem não funcionar.`
    );
  }
}
