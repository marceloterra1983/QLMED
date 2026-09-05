import prisma from '@/lib/prisma';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import { UNIMED_CG_ONEDRIVE_ACCOUNT } from './constants';

export async function resolveUnimedCgOneDrive(companyId: string): Promise<{
  accessToken: string;
  driveId: string;
}> {
  const connection = await prisma.oneDriveConnection.findFirst({
    where: { companyId, accountEmail: UNIMED_CG_ONEDRIVE_ACCOUNT },
  }) ?? await prisma.oneDriveConnection.findFirst({
    where: { companyId },
    orderBy: { updatedAt: 'desc' },
  });
  if (!connection) {
    throw new Error('conta de arquivo nao conectada');
  }
  const accessToken = await ensureValidOneDriveAccessToken(connection);
  return { accessToken, driveId: connection.driveId };
}
