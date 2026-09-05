import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as auth from '@/lib/auth';
import { apiValidationError } from '@/lib/api-error';
import { sanitizeError } from '@/lib/background-service-health';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { openOneDriveItemContent } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import { canWriteDocumentos, requireDocumentosPage } from '@/lib/documentos/access';
import {
  CERTIDAO_LABEL,
  DOCUMENTOS_ONEDRIVE_ACCOUNT,
  DOCUMENTOS_UPLOAD_MAX_BYTES,
} from '@/lib/documentos/constants';
import {
  resolveDocumentosShareRecipients,
  shareDocumentByEmail,
  ShareRecipientsNotAllowedError,
} from '@/lib/documentos/share-email';
import { toYmd } from '@/lib/documentos/validity';
import { documentosIdSchema } from '@/lib/schemas/documentos';

const log = createLogger('documentos/:id/compartilhar');

const shareBodySchema = z.object({
  recipients: z.array(z.string()).min(1),
  note: z.string().max(500).optional(),
});

async function pdfFromStream(body: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(body).arrayBuffer());
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await auth.requireEditor();
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return auth.forbiddenResponse();
    return auth.unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const parsedId = documentosIdSchema.safeParse({ id });
    if (!parsedId.success) return apiValidationError(parsedId.error);

    const access = await requireDocumentosPage();
    if (!access.ok) return access.response;
    if (!canWriteDocumentos(access.role)) return auth.forbiddenResponse();

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 });
    }
    const parsed = shareBodySchema.safeParse(json);
    if (!parsed.success) return apiValidationError(parsed.error);

    const resolved = resolveDocumentosShareRecipients(parsed.data.recipients);
    if (!resolved.ok) {
      return NextResponse.json({ error: 'Destinatário não permitido' }, { status: 400 });
    }

    const row = await prisma.companyDocument.findFirst({
      where: { id: parsedId.data.id, companyId: access.companyId },
      select: { id: true, fileName: true, oneDriveItemId: true, kind: true, validUntil: true },
    });
    if (!row?.oneDriveItemId) {
      return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
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

    /**
     * A rota irmã `[id]/arquivo` faz stream e nunca materializa; esta precisa do
     * conteúdo em memória para o anexar. Sem teto isso é um risco de processo,
     * não de pedido: o contentor corre com `mem_limit: 1g` e a materialização
     * tem pico de ~3x, portanto algumas centenas de MB derrubam a aplicação
     * inteira. E o alvo existe — os `BALANÇO <ano>.zip` são ingeridos como
     * linhas com `oneDriveItemId`, e esta é a única rota que os materializa.
     */
    if (content.size !== null && content.size > DOCUMENTOS_UPLOAD_MAX_BYTES) {
      await content.body.cancel().catch(() => {});
      return NextResponse.json(
        { error: 'Arquivo grande demais para anexar ao e-mail' },
        { status: 413 },
      );
    }

    const pdf = await pdfFromStream(content.body);
    const result = await shareDocumentByEmail({
      recipients: resolved.emails,
      fileName: row.fileName,
      pdf,
      kindLabel: CERTIDAO_LABEL[row.kind],
      validUntil: toYmd(row.validUntil),
      note: parsed.data.note,
    });

    return NextResponse.json({ sent: result.sent });
  } catch (error) {
    if (error instanceof ShareRecipientsNotAllowedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const raw = error instanceof Error ? error.message : 'envio falhou';
    log.error({ err: sanitizeError(raw) }, 'Falha ao compartilhar documento');
    return NextResponse.json({ error: 'Falha ao enviar e-mail' }, { status: 502 });
  }
}
