// Server-only module — nao importar de client components
import pino from 'pino';

/**
 * Logger estruturado usando pino.
 * Nivel configuravel via LOG_LEVEL env var (default: 'info').
 * Browser desabilitado para evitar problemas com Next.js SSR/client bundling.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  browser: { disabled: true },
});

/**
 * Factory para criar logger com contexto de modulo.
 * Uso: const log = createLogger('invoices');
 *      log.info({ id }, 'Invoice processada');
 */
export function createLogger(name: string) {
  return logger.child({ module: name });
}
