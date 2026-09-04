import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { openOneDriveItemContent } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import { requireDocumentosPage } from '@/lib/documentos/access';
import { DOCUMENTOS_ONEDRIVE_ACCOUNT } from '@/lib/documentos/constants';
import { documentosIdSchema } from '@/lib/schemas/documentos';

const log = createLogger('documentos/:id/arquivo');

function pdfDisposition(fileName: string, download: boolean): string {
  const fallback = fileName.replace(/[\\/\r\n"]/g, '_') || 'certidao.pdf';
  const type = download ? 'attachment' : 'inline';
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  request: Request,
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
    const parsed = documentosIdSchema.safeParse({ id });
    if (!parsed.success) return apiValidationError(parsed.error);

    const access = await requireDocumentosPage();
    if (!access.ok) return access.response;

    const row = await prisma.companyDocument.findFirst({
      where: { id: parsed.data.id, companyId: access.companyId },
      select: { id: true, fileName: true, oneDriveItemId: true },
    });
    if (!row?.oneDriveItemId) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    const connection = await prisma.oneDriveConnection.findFirst({
      where: { companyId: access.companyId, accountEmail: DOCUMENTOS_ONEDRIVE_ACCOUNT },
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

    const download = new URL(request.url).searchParams.get('download') === '1';
    log.info(
      { documentId: row.id, bytes: content.size, durationMs: Date.now() - startedAt },
      'PDF documentos pronto para stream',
    );

    return new Response(content.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': pdfDisposition(row.fileName, download),
        'Cache-Control': 'private, no-store',
        ...(content.size !== null ? { 'Content-Length': String(content.size) } : {}),
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao servir PDF de documento');
    return apiError(error, 'documentos/:id/arquivo');
  }
}
