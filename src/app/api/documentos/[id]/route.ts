import { NextResponse } from 'next/server';
import * as auth from '@/lib/auth';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { canWriteDocumentos, requireDocumentosPage } from '@/lib/documentos/access';
import { documentosIdSchema, documentosPatchSchema } from '@/lib/schemas/documentos';

const log = createLogger('documentos/:id');

export async function PATCH(
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

    const body: unknown = await request.json();
    const parsed = documentosPatchSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const updated = await prisma.companyDocument.updateMany({
      where: { id: parsedId.data.id, companyId: access.companyId },
      data: {
        validUntil: new Date(`${parsed.data.validUntil}T00:00:00.000Z`),
        validUntilSource: 'manual',
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      id: parsedId.data.id,
      validUntil: parsed.data.validUntil,
      validUntilSource: 'manual',
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao atualizar validade');
    return apiError(error, 'documentos/:id');
  }
}
