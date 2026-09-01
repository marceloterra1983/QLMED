import { assertAllowedHost } from '@/lib/http-allowlist';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

/** Único host que pode receber o Bearer do OneDrive. */
export const GRAPH_ALLOWED_HOSTS = ['graph.microsoft.com'] as const;

type GraphRequestOptions = {
  allowNotFound?: boolean;
};

/**
 * Resolve o alvo da requisição.
 *
 * Caminho relativo é nosso e vai direto. URL absoluta vem de fora — é o
 * `@odata.nextLink` da paginação — e precisa ser fixada no host do Graph antes
 * de o token ser anexado: sem isso um `nextLink` forjado exfiltra a credencial.
 */
function graphEndpoint(resourcePath: string): string {
  if (!/^https?:\/\//i.test(resourcePath)) return `${GRAPH_BASE_URL}${resourcePath}`;
  return assertAllowedHost(resourcePath, GRAPH_ALLOWED_HOSTS).toString();
}

function graphTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(Number(process.env.ONEDRIVE_TIMEOUT_MS) || 30_000);
}

export function normalizeOneDrivePath(rawPath: string): string {
  const trimmed = rawPath.trim().replace(/\\/g, '/');
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function oneDriveGraphJsonRequest<T>(accessToken: string, resourcePath: string): Promise<T>;
export function oneDriveGraphJsonRequest<T>(
  accessToken: string,
  resourcePath: string,
  options: { allowNotFound: true },
): Promise<T | null>;
export async function oneDriveGraphJsonRequest<T>(
  accessToken: string,
  resourcePath: string,
  options: GraphRequestOptions = {},
): Promise<T | null> {
  const response = await fetch(graphEndpoint(resourcePath), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal: graphTimeoutSignal(),
  });

  if (response.status === 404 && options.allowNotFound) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === 'object'
      ? JSON.stringify(payload).slice(0, 300)
      : `${response.status} ${response.statusText}`;
    throw new Error(`Falha na API do OneDrive: ${detail}`);
  }

  return payload as T;
}

export function oneDriveGraphDownloadFile(accessToken: string, resourcePath: string): Promise<Buffer>;
export function oneDriveGraphDownloadFile(
  accessToken: string,
  resourcePath: string,
  options: { allowNotFound: true },
): Promise<Buffer | null>;
export async function oneDriveGraphDownloadFile(
  accessToken: string,
  resourcePath: string,
  options: GraphRequestOptions = {},
): Promise<Buffer | null> {
  const response = await fetch(graphEndpoint(resourcePath), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: graphTimeoutSignal(),
  });

  if (response.status === 404 && options.allowNotFound) return null;

  if (!response.ok) {
    const detail = await response.text().catch(() => `${response.status} ${response.statusText}`);
    throw new Error(`Falha ao baixar arquivo do OneDrive: ${detail.slice(0, 300)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
