import { existsSync } from 'node:fs';

/** Neste Omarchy o pacote é `/usr/bin/chromium`. A imagem Docker usa `chromium-browser`. */
export const PREVIEW_CHROME_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
];

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export const DEFAULT_DEV_ENV_CANDIDATES = [
  '/home/marce/qlmed/app/.env',
];

export function pickEnvFile(candidates) {
  const list = (candidates ?? []).filter(Boolean);
  for (const path of list) {
    if (existsSync(path)) return path;
  }
  throw new Error(
    `preview: nenhum env encontrado (${list.join(', ') || 'lista vazia'}). ` +
      'Não use /srv/qlmed/env/app.env neste host (ADR-0020).',
  );
}

export const CANONICAL_WRITER_TUNNEL_PORT = '5435';
export const ISOLATED_RESTORE_PORT = '5434';

export function assertLoopbackDatabaseUrl(rawUrl) {
  if (!rawUrl?.trim()) {
    throw new Error('preview: DATABASE_URL ausente');
  }
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('preview: DATABASE_URL inválida');
  }
  const host = parsed.hostname;
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `preview recusa DATABASE_URL host=${host} (ADR-0020: só loopback)`,
    );
  }
  return parsed;
}

export function assertPreviewDatabaseUrl(rawUrl) {
  const parsed = assertLoopbackDatabaseUrl(rawUrl);
  const port = parsed.port || '5432';
  if (port === ISOLATED_RESTORE_PORT) {
    throw new Error(
      `preview recusa dump isolado :${ISOLATED_RESTORE_PORT} (ADR-0020: túnel :${CANONICAL_WRITER_TUNNEL_PORT})`,
    );
  }
  if (port !== CANONICAL_WRITER_TUNNEL_PORT) {
    throw new Error(
      `preview exige túnel do writer canônico :${CANONICAL_WRITER_TUNNEL_PORT} (ADR-0020)`,
    );
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
    .split('/')[0]
    .split('?')[0]
    .toLowerCase();
  if (databaseName !== 'postgres') {
    throw new Error('preview exige database postgres (ADR-0020)');
  }
  return parsed;
}

/**
 * Usa o caminho do env se o arquivo existe. Se o .env de dev aponta para o
 * binário da imagem Docker e ele não está neste host, cai no Chromium local.
 */
export function resolvePreviewChrome(configured, exists = existsSync) {
  const path = configured?.trim();
  if (path && exists(path)) return path;
  for (const candidate of PREVIEW_CHROME_CANDIDATES) {
    if (exists(candidate)) return candidate;
  }
  throw new Error(
    'preview: Chromium ausente. PUPPETEER_EXECUTABLE_PATH não aponta para um binário neste host.',
  );
}

export function resolvePreviewOrigin({ override, tailscaleIp } = {}) {
  const fromOverride = override?.trim();
  if (fromOverride) return fromOverride.replace(/\/$/, '');
  const ip = tailscaleIp?.trim();
  if (ip) return `http://${ip}:3002`;
  return 'http://127.0.0.1:3002';
}
