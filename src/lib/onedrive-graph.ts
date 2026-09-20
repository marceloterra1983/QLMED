import { assertAllowedHost } from '@/lib/http-allowlist';
import {
  refreshBoundOneDriveAccessToken,
  resolveBoundOneDriveAccessToken,
} from '@/lib/onedrive-auth';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

/** Único host que pode receber o Bearer do OneDrive. */
export const GRAPH_ALLOWED_HOSTS = ['graph.microsoft.com'] as const;
/**
 * Teto para download de item do OneDrive. Cobre XML de NF-e (KiB) e DANFE em
 * PDF (poucos MiB) com folga larga; existe para o corpo não ser ilimitado.
 */
export const MAX_ONEDRIVE_DOWNLOAD_BYTES = 25 * 1024 * 1024;

export const ONEDRIVE_RECONNECT_MESSAGE =
  'Token do OneDrive expirado. Reconecte a conta em Sistema → Configurações.';

type GraphRequestOptions = {
  allowNotFound?: boolean;
};

function isGraphAuthFailure(status: number, payload: unknown): boolean {
  if (status === 401) return true;
  if (!payload || typeof payload !== 'object') return false;
  const error = (payload as { error?: { code?: string; message?: string } }).error;
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  return code === 'InvalidAuthenticationToken' || /token is expired|Lifetime validation failed/i.test(message);
}

export function oneDriveGraphFailureMessage(status: number, payload: unknown): string {
  if (isGraphAuthFailure(status, payload)) return ONEDRIVE_RECONNECT_MESSAGE;
  const detail = payload && typeof payload === 'object'
    ? JSON.stringify(payload).slice(0, 300)
    : String(status);
  return `Falha na API do OneDrive: ${detail}`;
}

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

/**
 * Toda chamada Graph do OneDrive passa aqui. 401 = JWT recusado; se houver
 * refresh bound, uma retry com token novo. Sem bind, devolve o 401 para o
 * caller falhar como hoje — sem loop.
 */
export async function fetchMicrosoftGraph(
  accessToken: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  // Job longo captura o JWT no início: depois do primeiro refresh, as
  // próximas chamadas ainda passam o token velho. Troca pelo atual antes
  // de ir ao Graph — senão cada página gera 401 + refresh no IdP.
  let token = resolveBoundOneDriveAccessToken(accessToken);
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, {
      ...init,
      headers,
      cache: init.cache ?? 'no-store',
      signal: init.signal ?? graphTimeoutSignal(),
    });
    if (response.status !== 401 || attempt === 1) return response;
    const next = await refreshBoundOneDriveAccessToken(token);
    if (!next || next === token) return response;
    token = next;
  }
  throw new Error('fetchMicrosoftGraph: unreachable');
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
  const response = await fetchMicrosoftGraph(accessToken, graphEndpoint(resourcePath), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: graphTimeoutSignal(),
  });

  if (response.status === 404 && options.allowNotFound) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(oneDriveGraphFailureMessage(response.status, payload));
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
  const response = await fetchMicrosoftGraph(accessToken, graphEndpoint(resourcePath), {
    cache: 'no-store',
    signal: graphTimeoutSignal(),
  });

  if (response.status === 404 && options.allowNotFound) return null;

  if (!response.ok) {
    const detail = await response.text().catch(() => `${response.status} ${response.statusText}`);
    let payload: unknown = detail;
    try {
      payload = JSON.parse(detail) as unknown;
    } catch {
      payload = { error: { message: detail } };
    }
    throw new Error(
      isGraphAuthFailure(response.status, payload)
        ? ONEDRIVE_RECONNECT_MESSAGE
        : `Falha ao baixar arquivo do OneDrive: ${detail.slice(0, 300)}`,
    );
  }

  // Teto por Content-Length antes de materializar o corpo: um item gigante no
  // OneDrive não pode encher os 512MB de heap do processo (auditoria FILE-004).
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_ONEDRIVE_DOWNLOAD_BYTES) {
    throw new Error(
      `Arquivo do OneDrive excede o limite de ${MAX_ONEDRIVE_DOWNLOAD_BYTES} bytes (${declared})`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_ONEDRIVE_DOWNLOAD_BYTES) {
    // Sem Content-Length (chunked) o teto só dá para conferir aqui.
    throw new Error(
      `Arquivo do OneDrive excede o limite de ${MAX_ONEDRIVE_DOWNLOAD_BYTES} bytes`,
    );
  }
  return buffer;
}
