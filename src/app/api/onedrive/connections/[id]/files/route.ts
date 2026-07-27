import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { listOneDriveChildren } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import { apiError, apiValidationError } from '@/lib/api-error';
import { idParamSchema } from '@/lib/schemas/common';

const oneDriveFilesQuerySchema = z.object({
  itemId: z.string().trim().min(1).max(200).default('root'),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const paramsParsed = idParamSchema.safeParse({ id });
  if (!paramsParsed.success) return apiValidationError(paramsParsed.error);

  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const company = await getOrCreateSingleCompany(userId);
    const queryParsed = oneDriveFilesQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!queryParsed.success) return apiValidationError(queryParsed.error);
    const itemId = queryParsed.data.itemId;

    const connection = await prisma.oneDriveConnection.findFirst({
      where: {
        id,
        companyId: company.id,
      },
    });

    if (!connection) {
      return NextResponse.json({ error: 'Conexão OneDrive não encontrada' }, { status: 404 });
    }

    const accessToken = await ensureValidOneDriveAccessToken(connection);
    const items = await listOneDriveChildren(accessToken, connection.driveId, itemId);

    await prisma.oneDriveConnection.update({
      where: { id: connection.id },
      data: {
        lastValidatedAt: new Date(),
      },
    });

    return NextResponse.json({
      folderId: itemId,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        kind: item.folder ? 'folder' : 'file',
        childCount: item.folder?.childCount ?? null,
        size: item.size ?? 0,
        webUrl: item.webUrl ?? null,
        lastModifiedAt: item.lastModifiedDateTime || null,
      })),
    });
  } catch (error) {
    return apiError(error, 'onedrive/files');
  }
}
