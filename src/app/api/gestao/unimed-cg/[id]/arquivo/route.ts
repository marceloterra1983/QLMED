import { NextResponse } from 'next/server';
import { idParamSchema } from '@/lib/schemas/common';
import { apiError, apiValidationError } from '@/lib/api-error';
import { getUnimedCgAuthorization } from '@/lib/unimed-cg/store';
import { UNIMED_CG_ONEDRIVE_ACCOUNT } from '@/lib/unimed-cg/constants';
import { openOneDriveItemContent } from '@/lib/onedrive-client';
import { resolveAccountOneDrive } from '@/lib/onedrive-connections';
import { createStreamFileResponse } from '@/lib/file-response';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { requireUnimedCgPage } from '@/lib/unimed-cg/access';

const log = createLogger('gestao/unimed-cg/:id/arquivo');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  try {
    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) return apiValidationError(parsed.error);

    const access = await requireUnimedCgPage();
    if (!access.ok) return access.response;

    const row = await getUnimedCgAuthorization(access.companyId, parsed.data.id);
    if (!row?.oneDriveItemId) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    let oneDrive: { accessToken: string; driveId: string };
    try {
      oneDrive = await resolveAccountOneDrive(access.companyId, UNIMED_CG_ONEDRIVE_ACCOUNT, {
        allowFallback: false,
        errorMessage: 'Arquivo não encontrado',
      });
    } catch {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    const content = await openOneDriveItemContent(
      oneDrive.accessToken,
      oneDrive.driveId,
      row.oneDriveItemId,
    );

    log.info(
      { authorizationId: row.id, bytes: content.size, durationMs: Date.now() - startedAt },
      'PDF Unimed CG pronto para stream',
    );

    prisma.accessLog
      .create({
        data: {
          userId: access.userId,
          action: 'navigation',
          path: `download unimed-cg-autorizacao id=${row.id} file=${row.fileName}`,
        },
      })
      .catch((err) => log.warn({ err, authorizationId: row.id }, 'AccessLog unimed-cg pdf write failed'));

    return createStreamFileResponse(content.body, {
      fileName: row.fileName,
      contentLength: content.size,
      cacheControl: 'private, no-store',
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao servir PDF Unimed CG');
    return apiError(error, 'gestao/unimed-cg/:id/arquivo');
  }
}
