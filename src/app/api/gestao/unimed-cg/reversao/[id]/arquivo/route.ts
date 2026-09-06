import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { idParamSchema } from '@/lib/schemas/common';
import { apiError, apiValidationError } from '@/lib/api-error';
import { getUnimedCgReversal } from '@/lib/unimed-cg/reversal-store';
import { UNIMED_CG_ONEDRIVE_ACCOUNT } from '@/lib/unimed-cg/constants';
import { openOneDriveItemContent } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { requireUnimedCgPage } from '@/lib/unimed-cg/access';

const log = createLogger('gestao/unimed-cg/reversao/:id/arquivo');

function inlineDisposition(fileName: string): string {
  const fallback = fileName.replace(/[\\/\r\n"]/g, '_') || 'reversao.pdf';
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

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

    const row = await getUnimedCgReversal(access.companyId, parsed.data.id);
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

    log.info(
      { reversalId: row.id, bytes: content.size, durationMs: Date.now() - startedAt },
      'PDF Unimed CG reversão pronto para stream',
    );

    prisma.accessLog
      .create({
        data: {
          userId: access.userId,
          action: 'navigation',
          path: `download unimed-cg-reversao id=${row.id} file=${row.fileName}`,
        },
      })
      .catch((err) => log.warn({ err, reversalId: row.id }, 'AccessLog unimed-cg reversao pdf write failed'));

    return new Response(content.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': inlineDisposition(row.fileName),
        'Cache-Control': 'private, no-store',
        ...(content.size !== null ? { 'Content-Length': String(content.size) } : {}),
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao baixar PDF Unimed CG reversão');
    return apiError(error, 'gestao/unimed-cg/reversao/:id/arquivo');
  }
}
