import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { idParamSchema } from '@/lib/schemas/common';
import { apiError, apiValidationError } from '@/lib/api-error';
import { getImpcgAuthorization } from '@/lib/impcg/store';
import { IMPCG_ONEDRIVE_ACCOUNT } from '@/lib/impcg/constants';
import { openOneDriveItemContent } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import { createStreamFileResponse } from '@/lib/file-response';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { requireImpcgPage } from '@/lib/impcg/access';

const log = createLogger('gestao/impcg/:id/arquivo');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
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

    const connection = await prisma.oneDriveConnection.findFirst({
      where: { companyId: access.companyId, accountEmail: IMPCG_ONEDRIVE_ACCOUNT },
    });
    if (!connection) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    const accessToken = await ensureValidOneDriveAccessToken(connection);
    const content = await openOneDriveItemContent(
      accessToken,
      connection.driveId,
      row.oneDriveItemId,
    );
    if (!content.body) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    log.info(
      { authorizationId: row.id, bytes: content.size, durationMs: Date.now() - startedAt },
      'PDF IMPCG pronto para stream',
    );

    prisma.accessLog
      .create({
        data: {
          userId: access.userId,
          action: 'navigation',
          path: `download impcg-oficio id=${row.id} file=${row.fileName}`,
        },
      })
      .catch((err) => log.warn({ err, authorizationId: row.id }, 'AccessLog impcg pdf write failed'));

    return createStreamFileResponse(content.body, {
      fileName: row.fileName,
      contentLength: content.size,
      cacheControl: 'private, no-store',
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao servir PDF IMPCG');
    return apiError(error, 'gestao/impcg/:id/arquivo');
  }
}
