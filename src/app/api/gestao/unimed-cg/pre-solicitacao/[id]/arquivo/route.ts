import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { idParamSchema } from '@/lib/schemas/common';
import { apiError, apiValidationError } from '@/lib/api-error';
import { getUnimedCgPreSolicitation } from '@/lib/unimed-cg/pre-solicitation-store';
import { UNIMED_CG_ONEDRIVE_ACCOUNT } from '@/lib/unimed-cg/constants';
import { openOneDriveItemContent } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import { createStreamFileResponse } from '@/lib/file-response';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { requireUnimedCgPage } from '@/lib/unimed-cg/access';

const log = createLogger('gestao/unimed-cg/pre-solicitacao/:id/arquivo');

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

    const access = await requireUnimedCgPage();
    if (!access.ok) return access.response;

    const row = await getUnimedCgPreSolicitation(access.companyId, parsed.data.id);
    if (!row?.oneDriveItemId) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    const connection = await prisma.oneDriveConnection.findFirst({
      where: { companyId: access.companyId, accountEmail: UNIMED_CG_ONEDRIVE_ACCOUNT },
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
      { preSolicitationId: row.id, bytes: content.size, durationMs: Date.now() - startedAt },
      'PDF Unimed CG pré-solicitação pronto para stream',
    );

    prisma.accessLog
      .create({
        data: {
          userId: access.userId,
          action: 'navigation',
          path: `download unimed-cg-pre-solicitacao id=${row.id} file=${row.fileName}`,
        },
      })
      .catch((err) => log.warn({ err, preSolicitationId: row.id }, 'AccessLog unimed-cg pre pdf write failed'));

    return createStreamFileResponse(content.body, {
      fileName: row.fileName,
      contentLength: content.size,
      cacheControl: 'private, no-store',
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao baixar PDF Unimed CG pré-solicitação');
    return apiError(error, 'gestao/unimed-cg/pre-solicitacao/:id/arquivo');
  }
}
