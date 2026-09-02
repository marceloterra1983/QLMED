import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { idParamSchema } from '@/lib/schemas/common';
import { apiError, apiValidationError } from '@/lib/api-error';
import { getImpcgAuthorization } from '@/lib/impcg/store';
import { IMPCG_ONEDRIVE_ACCOUNT } from '@/lib/impcg/constants';
import { openOneDriveItemContent } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { requireImpcgPage } from '@/lib/impcg/access';

const log = createLogger('gestao/impcg/:id/arquivo');

function inlineDisposition(fileName: string): string {
  const fallback = fileName.replace(/[\\/\r\n"]/g, '_') || 'oficio.pdf';
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

    const access = await requireImpcgPage();
    if (!access.ok) return access.response;

    const row = await getImpcgAuthorization(access.companyId, parsed.data.id);
    if (!row?.oneDriveItemId) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    // Só a conexão NOMEADA do IMPCG. O fallback "qualquer conexão OneDrive da
    // empresa" fazia o download de um documento clínico sair por uma caixa que
    // não é a dele — e ninguém percebia, porque devolvia 200 (PRIV-002).
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

    log.info(
      { authorizationId: row.id, bytes: content.size, durationMs: Date.now() - startedAt },
      'PDF IMPCG pronto para stream',
    );

    // O ofício é documento clínico: quem abriu tem de ficar na trilha, não só
    // o tamanho do arquivo (auditoria PRIV-002). Fire-and-forget para não
    // segurar o stream, no padrão já usado em users/[id] e auth/logout.
    prisma.accessLog
      .create({
        data: {
          userId: access.userId,
          action: 'navigation',
          path: `download impcg-oficio id=${row.id} file=${row.fileName}`,
        },
      })
      .catch((err) => log.warn({ err, authorizationId: row.id }, 'AccessLog impcg pdf write failed'));

    return new Response(content.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': inlineDisposition(row.fileName),
        'Cache-Control': 'private, no-store',
        ...(content.size !== null ? { 'Content-Length': String(content.size) } : {}),
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao servir PDF IMPCG');
    return apiError(error, 'gestao/impcg/:id/arquivo');
  }
}
