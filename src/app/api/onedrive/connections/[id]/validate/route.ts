import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import {
  getOneDriveAccountEmail,
  getOneDriveDrive,
  getOneDriveProfile,
} from '@/lib/onedrive-client';
import {
  ensureValidOneDriveAccessToken,
  mapOneDriveConnectionSummary,
} from '@/lib/onedrive-connections';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const company = await getOrCreateSingleCompany(userId);

    const connection = await prisma.oneDriveConnection.findFirst({
      where: {
        id: params.id,
        companyId: company.id,
      },
    });

    if (!connection) {
      return NextResponse.json({ error: 'Conexão OneDrive não encontrada' }, { status: 404 });
    }

    const accessToken = await ensureValidOneDriveAccessToken(connection);

    const [profile, drive] = await Promise.all([
      getOneDriveProfile(accessToken),
      getOneDriveDrive(accessToken),
    ]);

    const accountEmail = getOneDriveAccountEmail(profile) || connection.accountEmail;

    const updated = await prisma.oneDriveConnection.update({
      where: { id: connection.id },
      data: {
        accountEmail,
        accountName: profile.displayName || connection.accountName,
        microsoftUserId: profile.id || connection.microsoftUserId,
        driveId: drive.id,
        driveType: drive.driveType || connection.driveType,
        driveWebUrl: drive.webUrl || connection.driveWebUrl,
        lastValidatedAt: new Date(),
      },
      select: {
        id: true,
        accountEmail: true,
        accountName: true,
        driveId: true,
        driveType: true,
        driveWebUrl: true,
        tokenExpiresAt: true,
        lastValidatedAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      connection: mapOneDriveConnectionSummary(updated),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao validar conexão OneDrive';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
