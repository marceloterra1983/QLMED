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
  shareDocumentByWhatsApp,
  ShareWhatsAppNumberError,
  ShareWhatsAppUnavailableError,
  WhatsAppSendError,
} from '@/lib/documentos/share-whatsapp';
import { toYmd } from '@/lib/documentos/validity';
import { documentosIdSchema } from '@/lib/schemas/documentos';

const log = createLogger('documentos/:id/compartilhar-whatsapp');

const bodySchema = z.object({
  phone: z.string().min(8).max(32),
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
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return apiValidationError(parsed.error);

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

    if (content.size !== null && content.size > DOCUMENTOS_UPLOAD_MAX_BYTES) {
      await content.body.cancel().catch(() => {});
      return NextResponse.json(
        { error: 'Arquivo grande demais para enviar pelo WhatsApp' },
        { status: 413 },
      );
    }

    const pdf = await pdfFromStream(content.body);
    const result = await shareDocumentByWhatsApp({
      phone: parsed.data.phone,
      fileName: row.fileName,
      pdf,
      kindLabel: CERTIDAO_LABEL[row.kind],
      validUntil: toYmd(row.validUntil),
      note: parsed.data.note,
    });

    return NextResponse.json({ sent: result.jid });
  } catch (error) {
    if (error instanceof ShareWhatsAppNumberError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ShareWhatsAppUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof WhatsAppSendError) {
      log.error({ err: sanitizeError(error.message) }, 'Falha ao enviar WhatsApp');
      return NextResponse.json({ error: 'Falha ao enviar WhatsApp' }, { status: 502 });
    }
    const raw = error instanceof Error ? error.message : 'envio falhou';
    log.error({ err: sanitizeError(raw) }, 'Falha ao compartilhar documento via WhatsApp');
    return NextResponse.json({ error: 'Falha ao enviar WhatsApp' }, { status: 502 });
  }
}
