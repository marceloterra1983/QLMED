import { NextResponse } from 'next/server';
import * as auth from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { formDataWithLimit } from '@/lib/upload-limits';
import { looksLikePdf } from '@/lib/pdf/ocr-limits';
import { canWriteDocumentos, requireDocumentosPage } from '@/lib/documentos/access';
import { DOCUMENTOS_UPLOAD_MAX_BYTES } from '@/lib/documentos/constants';
import { readValidityFromPdf } from '@/lib/documentos/pdf-validity';

const log = createLogger('documentos/analisar');
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

    // readValidityFromPdf nunca lança: PDF sem texto → 200 confidence nenhuma.
    const result = await readValidityFromPdf(content);
    return NextResponse.json(result);
  } catch (error) {
    log.error({ err: error }, 'Falha ao analisar PDF');
    return apiError(error, 'documentos/analisar');
  }
}
