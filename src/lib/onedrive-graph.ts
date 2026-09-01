const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

/**
 * Teto para download de item do OneDrive. Cobre XML de NF-e (KiB) e DANFE em
 * PDF (poucos MiB) com folga larga; existe para o corpo não ser ilimitado.
 */
export const MAX_ONEDRIVE_DOWNLOAD_BYTES = 25 * 1024 * 1024;

type GraphRequestOptions = {
  allowNotFound?: boolean;
};

function graphEndpoint(resourcePath: string): string {
  return resourcePath.startsWith('http') ? resourcePath : `${GRAPH_BASE_URL}${resourcePath}`;
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
