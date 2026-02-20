import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { listOneDriveChildren } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const company = await getOrCreateSingleCompany(userId);
    const itemId = request.nextUrl.searchParams.get('itemId')?.trim() || 'root';

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
    const message = error instanceof Error ? error.message : 'Erro ao listar arquivos do OneDrive';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
