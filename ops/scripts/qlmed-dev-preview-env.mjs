import { existsSync } from 'node:fs';

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

export function resolvePreviewOrigin({ override, tailscaleIp } = {}) {
  const fromOverride = override?.trim();
  if (fromOverride) return fromOverride.replace(/\/$/, '');
  const ip = tailscaleIp?.trim();
  if (ip) return `http://${ip}:3002`;
  return 'http://127.0.0.1:3002';
}
