import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { idParamSchema } from '@/lib/schemas/common';
import { apiError, apiValidationError } from '@/lib/api-error';
import { getImpcgAuthorization } from '@/lib/impcg/store';
import { IMPCG_ONEDRIVE_ACCOUNT } from '@/lib/impcg/constants';
import { downloadOneDriveItemContent } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { requireImpcgPage } from '../../route';

const log = createLogger('gestao/impcg/:id/arquivo');

function inlineDisposition(fileName: string): string {
  const fallback = fileName.replace(/[\\/\r\n"]/g, '_') || 'oficio.pdf';
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) return apiValidationError(parsed.error);

    const access = await requireImpcgPage();
    if (!access.ok) return access.response;

    const row = await getImpcgAuthorization(access.companyId, parsed.data.id);
    if (!row?.oneDriveItemId) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    const connection =
      (await prisma.oneDriveConnection.findFirst({
        where: { companyId: access.companyId, accountEmail: IMPCG_ONEDRIVE_ACCOUNT },
      })) ??
      (await prisma.oneDriveConnection.findFirst({
        where: { companyId: access.companyId },
      }));
    if (!connection) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    const accessToken = await ensureValidOneDriveAccessToken(connection);
    const bytes = await downloadOneDriveItemContent(
      accessToken,
      connection.driveId,
      row.oneDriveItemId,
    );

    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': inlineDisposition(row.fileName),
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao servir PDF IMPCG');
    return apiError(error, 'gestao/impcg/:id/arquivo');
  }
}
