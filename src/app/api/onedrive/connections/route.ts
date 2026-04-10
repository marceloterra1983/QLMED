import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { mapOneDriveConnectionSummary } from '@/lib/onedrive-connections';
import { apiError } from '@/lib/api-error';

export async function GET() {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const company = await getOrCreateSingleCompany(userId);

    const connections = await prisma.oneDriveConnection.findMany({
      where: { companyId: company.id },
      orderBy: { updatedAt: 'desc' },
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
      connections: connections.map(mapOneDriveConnectionSummary),
    });
  } catch (error) {
    return apiError(error, 'onedrive/connections');
  }
}
