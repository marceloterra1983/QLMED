import { NextResponse } from 'next/server';
import * as auth from '@/lib/auth';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { formDataWithLimit } from '@/lib/upload-limits';
import { looksLikePdf } from '@/lib/pdf/ocr-limits';
import { canWriteDocumentos, requireDocumentosPage } from '@/lib/documentos/access';
import { DOCUMENTOS_UPLOAD_MAX_BYTES } from '@/lib/documentos/constants';
import {
  DocumentosOneDriveMissingError,
  DocumentosUploadTooLargeError,
  uploadDocumentosPdf,
} from '@/lib/documentos/upload';
import { documentosUploadFieldsSchema } from '@/lib/schemas/documentos';

const log = createLogger('documentos/upload');
const MAX_BODY_SIZE = DOCUMENTOS_UPLOAD_MAX_BYTES + 64 * 1024;

export async function POST(request: Request) {
  try {
    await auth.requireEditor();
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return auth.forbiddenResponse();
    return auth.unauthorizedResponse();
  }

  try {
    const access = await requireDocumentosPage();
    if (!access.ok) return access.response;
    if (!canWriteDocumentos(access.role)) return auth.forbiddenResponse();

    const formData = await formDataWithLimit(request, MAX_BODY_SIZE);
    const file = formData.get('file');
    const fields = documentosUploadFieldsSchema.safeParse({
      kind: formData.get('kind'),
      validUntil: formData.get('validUntil'),
    });
    if (!fields.success) return apiValidationError(fields.error);

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Arquivo PDF é obrigatório' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Formato inválido. Envie um arquivo .pdf' }, { status: 400 });
    }
    if (file.size > DOCUMENTOS_UPLOAD_MAX_BYTES) {
      return NextResponse.json({ error: 'Arquivo excede o limite de 5 MB' }, { status: 400 });
    }

    const content = Buffer.from(await file.arrayBuffer());
    if (!looksLikePdf(content)) {
      return NextResponse.json({ error: 'Arquivo PDF inválido' }, { status: 400 });
    }

    const row = await uploadDocumentosPdf({
      companyId: access.companyId,
      kind: fields.data.kind,
      validUntil: fields.data.validUntil,
      content,
    });
    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof DocumentosUploadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DocumentosOneDriveMissingError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    log.error({ err: error }, 'Falha no upload de documento');
    return apiError(error, 'documentos/upload');
  }
}
