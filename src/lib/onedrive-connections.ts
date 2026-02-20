import { OneDriveConnection } from '@prisma/client';
import prisma from '@/lib/prisma';
import { decrypt, encrypt } from '@/lib/crypto';
import { refreshOneDriveAccessToken } from '@/lib/onedrive-client';

const TOKEN_REFRESH_WINDOW_MS = 2 * 60 * 1000;

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

export async function ensureValidOneDriveAccessToken(connection: OneDriveConnection): Promise<string> {
  const expiresSoon = connection.tokenExpiresAt.getTime() <= Date.now() + TOKEN_REFRESH_WINDOW_MS;
  const currentAccessToken = decrypt(connection.accessToken);

  if (!expiresSoon) {
    return currentAccessToken;
  }

  const currentRefreshToken = connection.refreshToken ? decrypt(connection.refreshToken) : null;
  if (!currentRefreshToken) {
    throw new Error('Token expirado sem refresh token. Reconecte a conta no OneDrive.');
  }

  const refreshed = await refreshOneDriveAccessToken(currentRefreshToken);
  const nextRefreshToken = refreshed.refresh_token || currentRefreshToken;
  const nextExpiresAt = new Date(Date.now() + Math.max(refreshed.expires_in - 60, 1) * 1000);

  await prisma.oneDriveConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encrypt(refreshed.access_token),
      refreshToken: encrypt(nextRefreshToken),
      tokenExpiresAt: nextExpiresAt,
      scope: refreshed.scope || connection.scope,
    },
  });

  return refreshed.access_token;
}
