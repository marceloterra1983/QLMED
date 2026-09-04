import { generateOneDriveOAuthState } from '@/lib/onedrive-oauth-state';

const GRAPH_SCOPE = 'offline_access User.Read Files.ReadWrite';

export type OneDriveTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  refresh_token?: string;
};

export type OneDriveProfile = {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

export type OneDriveDrive = {
  id: string;
  driveType?: string;
  webUrl?: string;
};

export type OneDriveItem = {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  lastModifiedDateTime?: string;
  createdDateTime?: string;
  folder?: {
    childCount?: number;
  };
  file?: {
    mimeType?: string;
  };
};

type OneDriveChildrenResponse = {
  value?: OneDriveItem[];
};

function requireOAuthConfig() {
  const tenantId = process.env.TENANT_ID;
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;

  if (!tenantId || !clientId || !redirectUri) {
    throw new Error('TENANT_ID, CLIENT_ID e REDIRECT_URI devem estar configurados no .env');
  }

  return { tenantId, clientId, redirectUri };
}

function requireOAuthSecret() {
  const clientSecret = process.env.CLIENT_SECRET;
  if (!clientSecret) {
    throw new Error('CLIENT_SECRET não configurado no .env');
  }
  return clientSecret;
}

function tokenEndpoint(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

function parseErrorDetails(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;

  const parsed = payload as {
    error?: string | { message?: string };
    error_description?: string;
  };

  if (typeof parsed.error_description === 'string' && parsed.error_description.trim()) {
    return parsed.error_description;
  }

  if (typeof parsed.error === 'string' && parsed.error.trim()) {
    return parsed.error;
  }

  if (parsed.error && typeof parsed.error === 'object' && typeof parsed.error.message === 'string') {
    return parsed.error.message;
  }

  return fallback;
}

async function requestToken(params: URLSearchParams): Promise<OneDriveTokenResponse> {
  const { tenantId } = requireOAuthConfig();
  const response = await fetch(tokenEndpoint(tenantId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    cache: 'no-store',
    // Timeout p/ não travar o fluxo se o endpoint de token não responder
    // (fetch não tem timeout por padrão). Painel 2026-07-22.
    signal: AbortSignal.timeout(Number(process.env.ONEDRIVE_TIMEOUT_MS) || 30000),
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const detail = parseErrorDetails(payload, `${response.status} ${response.statusText}`);
    throw new Error(`Falha ao obter token OneDrive: ${detail}`);
  }

  return payload as OneDriveTokenResponse;
}

export function buildOneDriveAuthorizeUrl(options?: { loginHint?: string; state?: string }): string {
  const { tenantId, clientId, redirectUri } = requireOAuthConfig();

  const url = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', GRAPH_SCOPE);
  url.searchParams.set('state', options?.state || generateOneDriveOAuthState());

  const loginHint = options?.loginHint?.trim();
  if (loginHint) {
    url.searchParams.set('prompt', 'login');
    url.searchParams.set('login_hint', loginHint);
  } else {
    url.searchParams.set('prompt', 'select_account');
  }

  return url.toString();
}

export async function exchangeOneDriveCode(code: string): Promise<OneDriveTokenResponse> {
  const { clientId, redirectUri } = requireOAuthConfig();
  const clientSecret = requireOAuthSecret();

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    scope: GRAPH_SCOPE,
  });

  return requestToken(params);
}

export async function refreshOneDriveAccessToken(refreshToken: string): Promise<OneDriveTokenResponse> {
  const { clientId } = requireOAuthConfig();
  const clientSecret = requireOAuthSecret();

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: GRAPH_SCOPE,
  });

  return requestToken(params);
}

async function graphRequest<T>(resourcePath: string, accessToken: string): Promise<T> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${resourcePath}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
    // Timeout p/ não travar em chamada à Graph API sem resposta. Painel 2026-07-22.
    signal: AbortSignal.timeout(Number(process.env.ONEDRIVE_TIMEOUT_MS) || 30000),
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const detail = parseErrorDetails(payload, `${response.status} ${response.statusText}`);
    throw new Error(`Falha na API do OneDrive: ${detail}`);
  }

  return payload as T;
}

export function getOneDriveAccountEmail(profile: OneDriveProfile): string | null {
  const email = (profile.mail || profile.userPrincipalName || '').trim();
  return email ? email.toLowerCase() : null;
}

export async function getOneDriveProfile(accessToken: string): Promise<OneDriveProfile> {
  return graphRequest<OneDriveProfile>('/me?$select=id,displayName,mail,userPrincipalName', accessToken);
}

export async function getOneDriveDrive(accessToken: string): Promise<OneDriveDrive> {
  return graphRequest<OneDriveDrive>('/me/drive?$select=id,driveType,webUrl', accessToken);
}

export async function listOneDriveChildren(
  accessToken: string,
  driveId: string,
  itemId: string = 'root'
): Promise<OneDriveItem[]> {
  const encodedDriveId = encodeURIComponent(driveId);
  const encodedItemId = encodeURIComponent(itemId);

  const select = '$select=id,name,size,webUrl,lastModifiedDateTime,createdDateTime,folder,file';
  const top = '$top=50';

  const path = itemId === 'root'
    ? `/drives/${encodedDriveId}/root/children?${top}&${select}`
    : `/drives/${encodedDriveId}/items/${encodedItemId}/children?${top}&${select}`;

  const response = await graphRequest<OneDriveChildrenResponse>(path, accessToken);
  return response.value || [];
}

function graphTimeoutMs(): number {
  return Number(process.env.ONEDRIVE_TIMEOUT_MS) || 30_000;
}

async function graphWrite<T>(
  accessToken: string,
  resourcePath: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${resourcePath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(graphTimeoutMs()),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const detail = parseErrorDetails(payload, `${response.status} ${response.statusText}`);
    throw new Error(`Falha na API do OneDrive: ${detail}`);
  }
  return payload as T;
}

export async function ensureOneDriveFolder(
  accessToken: string,
  driveId: string,
  folderPath: string,
): Promise<{ id: string }> {
  const encodedDriveId = encodeURIComponent(driveId);
  const segments = folderPath.split('/').map((part) => part.trim()).filter(Boolean);
  let parentId = 'root';
  let walked = '';

  for (const segment of segments) {
    walked = walked ? `${walked}/${segment}` : segment;
    const existing = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodedDriveId}/root:/${encodeURI(walked)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(graphTimeoutMs()),
      },
    );
    if (existing.ok) {
      const item = (await existing.json()) as OneDriveItem;
      parentId = item.id;
      continue;
    }
    if (existing.status !== 404) {
      const payload = await existing.json().catch(() => null);
      throw new Error(`Falha na API do OneDrive: ${parseErrorDetails(payload, String(existing.status))}`);
    }

    const created = await graphWrite<OneDriveItem>(
      accessToken,
      parentId === 'root'
        ? `/drives/${encodedDriveId}/root/children`
        : `/drives/${encodedDriveId}/items/${encodeURIComponent(parentId)}/children`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: segment,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        }),
      },
    );
    parentId = created.id;
  }

  return { id: parentId };
}

export async function uploadOneDriveFile(
  accessToken: string,
  driveId: string,
  folderPath: string,
  fileName: string,
  content: Buffer,
): Promise<{ id: string; name: string }> {
  const encodedDriveId = encodeURIComponent(driveId);
  const remotePath = `${folderPath.replace(/\/$/, '')}/${fileName}`.replace(/^\/+/, '');
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${encodedDriveId}/root:/${encodeURI(remotePath)}:/content`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/pdf',
      },
      body: new Uint8Array(content),
      cache: 'no-store',
      signal: AbortSignal.timeout(graphTimeoutMs()),
    },
  );
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(`Falha na API do OneDrive: ${parseErrorDetails(payload, `${response.status}`)}`);
  }
  const item = payload as OneDriveItem;
  return { id: item.id, name: item.name };
}

async function fetchOneDriveItemContent(
  accessToken: string,
  driveId: string,
  itemId: string,
): Promise<Response> {
  const encodedDriveId = encodeURIComponent(driveId);
  const encodedItemId = encodeURIComponent(itemId);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${encodedDriveId}/items/${encodedItemId}/content`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(graphTimeoutMs()),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => `${response.status}`);
    throw new Error(`Falha ao baixar arquivo do OneDrive: ${detail.slice(0, 300)}`);
  }
  return response;
}

export async function downloadOneDriveItemContent(
  accessToken: string,
  driveId: string,
  itemId: string,
): Promise<Buffer> {
  const response = await fetchOneDriveItemContent(accessToken, driveId, itemId);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Abre o conteúdo sem materializar o arquivo: quem serve o PDF repassa o
 * stream e o browser recebe o primeiro byte antes de o Graph terminar.
 */
export async function openOneDriveItemContent(
  accessToken: string,
  driveId: string,
  itemId: string,
): Promise<{ body: ReadableStream<Uint8Array> | null; size: number | null }> {
  const response = await fetchOneDriveItemContent(accessToken, driveId, itemId);
  const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  return {
    body: response.body,
    size: Number.isFinite(declared) ? declared : null,
  };
}

/**
 * Compensação do upload: remove o objeto que ficou sem linha correspondente no
 * banco. Um PUT no Graph não participa da transação Postgres, então o que se
 * pode garantir não é atomicidade, é recolher o órfão — e ofício carrega dado
 * clínico, então deixá-lo para trás não é opção. 404 conta como sucesso: o
 * objeto já não está lá.
 */
export async function moveOneDriveItem(
  accessToken: string,
  driveId: string,
  itemId: string,
  novoParentId: string,
): Promise<{ id: string; parentId: string | null }> {
  const encodedDriveId = encodeURIComponent(driveId);
  const encodedItemId = encodeURIComponent(itemId);
  const payload = await graphWrite<OneDriveItem & { parentReference?: { id?: string } }>(
    accessToken,
    `/drives/${encodedDriveId}/items/${encodedItemId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentReference: { id: novoParentId } }),
    },
  );
  return { id: payload.id, parentId: payload.parentReference?.id ?? null };
}

export async function deleteOneDriveItem(
  accessToken: string,
  driveId: string,
  itemId: string,
): Promise<void> {
  const encodedDriveId = encodeURIComponent(driveId);
  const encodedItemId = encodeURIComponent(itemId);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${encodedDriveId}/items/${encodedItemId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(graphTimeoutMs()),
    },
  );
  if (!response.ok && response.status !== 404) {
    const detail = await response.text().catch(() => `${response.status}`);
    throw new Error(`Falha ao remover arquivo do OneDrive: ${detail.slice(0, 300)}`);
  }
}
