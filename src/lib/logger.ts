// Server-only module — nao importar de client components
import pino from 'pino';

/**
 * Campos que nunca podem sair num agregador de logs: segredo, chave privada,
 * XML fiscal inteiro ou payload de webhook (que carrega o que o n8n mandar).
 *
 * Pino casa `paths` literalmente: `'payload'` só pega a raiz e `'*.payload'`
 * só pega um nível. Por isso cada nome aparece nos três níveis que os logs
 * desta app realmente usam (raiz, `{ ctx: { ... } }`, `{ a: { b: { ... } } }`).
 * Auditoria OBS-001.
 */
const SECRET_FIELDS = [
  'payload',
  'password',
  'pfxData',
  'pfxPassword',
  'pfx',
  'privateKey',
  'keyPem',
  'certPem',
  'signedXml',
  'protocolXml',
  'xml',
  'xmlContent',
  'apiToken',
  'accessToken',
  'refreshToken',
  'token',
  'secret',
  'authorization',
  'cookie',
  'clientSecret',
  'webhookSecret',
  // Achado REAUD-B-09: nomes que existem no código e faltavam aqui.
  // `apiKey` é o campo de `EvolutionConfig`; `apikey` é o header que a
  // Evolution recebe — o `redact` do pino distingue caixa.
  'apiKey',
  'apikey',
  'senha',
  'pin',
  'sessionToken',
  'keyHash',
  'privatePem',
  'raw',
];

const redactPaths = SECRET_FIELDS.flatMap((field) => [
  field,
  `*.${field}`,
  `*.*.${field}`,
  // Quarto nível: o `err` serializado carrega objectos aninhados
  // (`err.response.headers.authorization`), e três níveis não chegavam lá.
  `*.*.*.${field}`,
]).concat([
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
]);

/**
 * Opções do logger. Exportadas para que o teste possa instanciar um pino
 * idêntico sobre um stream de memória e provar que o segredo NÃO sai — o
 * logger real escreve direto no fd 1 e não dá para inspecionar.
 */
export const loggerOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  browser: { disabled: true },
  redact: { paths: redactPaths, censor: '[REDACTED]' },
};

/**
 * Logger estruturado usando pino.
 * Nivel configuravel via LOG_LEVEL env var (default: 'info').
 * Browser desabilitado para evitar problemas com Next.js SSR/client bundling.
 */
export const logger = pino(loggerOptions);

/**
 * Factory para criar logger com contexto de modulo.
 * Uso: const log = createLogger('invoices');
 *      log.info({ id }, 'Invoice processada');
 */
export function createLogger(name: string) {
  return logger.child({ module: name });
}
