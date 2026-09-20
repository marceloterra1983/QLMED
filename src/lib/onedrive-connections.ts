import { OneDriveConnection } from '@prisma/client';
import prisma from '@/lib/prisma';
import { decrypt, encrypt } from '@/lib/crypto';
import { bindOneDriveAccessTokenRefresh } from '@/lib/onedrive-auth';
import { refreshOneDriveAccessToken } from '@/lib/onedrive-client';

const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const refreshInflight = new Map<string, Promise<string>>();

export type OneDriveConnectionSummary = {
  id: string;
  accountEmail: string;
  accountName: string | null;
  driveId: string;
  driveType: string | null;
  driveWebUrl: string | null;
  tokenExpiresAt: string;
  lastValidatedAt: string | null;
  updatedAt: string;
  isExpired: boolean;
};

export function mapOneDriveConnectionSummary(connection: {
  id: string;
  accountEmail: string;
  accountName: string | null;
  driveId: string;
  driveType: string | null;
  driveWebUrl: string | null;
  tokenExpiresAt: Date;
  lastValidatedAt: Date | null;
  updatedAt: Date;
}): OneDriveConnectionSummary {
  return {
    id: connection.id,
    accountEmail: connection.accountEmail,
    accountName: connection.accountName,
    driveId: connection.driveId,
    driveType: connection.driveType,
    driveWebUrl: connection.driveWebUrl,
    tokenExpiresAt: connection.tokenExpiresAt.toISOString(),
    lastValidatedAt: connection.lastValidatedAt ? connection.lastValidatedAt.toISOString() : null,
    updatedAt: connection.updatedAt.toISOString(),
    isExpired: connection.tokenExpiresAt.getTime() <= Date.now(),
  };
}

function bindCurrentAccessToken(connection: OneDriveConnection, accessToken: string): void {
  bindOneDriveAccessTokenRefresh(accessToken, connection.id, () =>
    ensureValidOneDriveAccessToken(connection, { force: true }),
  );
}

async function persistRefreshedOneDriveToken(connection: OneDriveConnection): Promise<string> {
  const currentRefreshToken = connection.refreshToken ? decrypt(connection.refreshToken) : null;
  if (!currentRefreshToken) {
    throw new Error('Token expirado sem refresh token. Reconecte a conta no OneDrive.');
  }

  const refreshed = await refreshOneDriveAccessToken(currentRefreshToken);
  const nextRefreshToken = refreshed.refresh_token || currentRefreshToken;
  const nextExpiresAt = new Date(Date.now() + Math.max(refreshed.expires_in - 60, 1) * 1000);
  const encryptedAccess = encrypt(refreshed.access_token);
  const encryptedRefresh = encrypt(nextRefreshToken);

  await prisma.oneDriveConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      tokenExpiresAt: nextExpiresAt,
      scope: refreshed.scope || connection.scope,
    },
  });

  // Job longo reusa este objeto: sem mutar, o próximo ensureValid ainda
  // veria o tokenExpiresAt velho e o Graph layer o JWT já recusado.
  connection.accessToken = encryptedAccess;
  connection.refreshToken = encryptedRefresh;
  connection.tokenExpiresAt = nextExpiresAt;
  if (refreshed.scope) connection.scope = refreshed.scope;

  bindCurrentAccessToken(connection, refreshed.access_token);
  return refreshed.access_token;
}

export async function ensureValidOneDriveAccessToken(
  connection: OneDriveConnection,
  options?: { force?: boolean },
): Promise<string> {
  const expiresSoon = connection.tokenExpiresAt.getTime() <= Date.now() + TOKEN_REFRESH_WINDOW_MS;
  if (!options?.force && !expiresSoon) {
    const currentAccessToken = decrypt(connection.accessToken);
    bindCurrentAccessToken(connection, currentAccessToken);
    return currentAccessToken;
  }

  const inflight = refreshInflight.get(connection.id);
  if (inflight) return inflight;

  const pending = persistRefreshedOneDriveToken(connection).finally(() => {
    refreshInflight.delete(connection.id);
  });
  refreshInflight.set(connection.id, pending);
  return pending;
}

/**
 * Localiza a conexão OneDrive ativa para a empresa (com suporte a conta específica e fallback opcional),
 * valida / renova o access token criptografado e retorna as credenciais prontas para uso.
 */
export async function resolveAccountOneDrive(
  companyId: string,
  accountEmail?: string | null,
  options?: {
    allowFallback?: boolean;
    errorMessage?: string;
  },
): Promise<{ accessToken: string; driveId: string }> {
  const allowFallback = options?.allowFallback !== false;
  const connection = (accountEmail
    ? await prisma.oneDriveConnection.findFirst({
        where: { companyId, accountEmail },
      })
    : null) ?? (allowFallback
      ? await prisma.oneDriveConnection.findFirst({
          where: { companyId },
          orderBy: { updatedAt: 'desc' },
        })
      : null);

  if (!connection) {
    throw new Error(options?.errorMessage ?? 'Conexão OneDrive não encontrada');
  }

  const accessToken = await ensureValidOneDriveAccessToken(connection);
  return { accessToken, driveId: connection.driveId };
}
