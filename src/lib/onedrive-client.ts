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
  url.searchParams.set('state', options?.state || `qlmed-${Date.now()}`);

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
  const { clientId, redirectUri } = requireOAuthConfig();
  const clientSecret = requireOAuthSecret();

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    redirect_uri: redirectUri,
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
