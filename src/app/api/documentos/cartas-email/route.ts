import { NextResponse } from 'next/server';
import * as auth from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { canWriteDocumentos, requireDocumentosPage } from '@/lib/documentos/access';
import { DocumentosIngestBusyError, runDocumentosIngest } from '@/lib/documentos/ingest';

const log = createLogger('documentos/cartas-email');

export async function POST() {
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

    const ingest = await runDocumentosIngest(access.companyId);
    return NextResponse.json({
      mail: ingest.cartaMail ?? { scanned: 0, imported: 0, skipped: 0, failed: 0 },
      ingest,
    });
  } catch (error) {
    if (error instanceof DocumentosIngestBusyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    log.error({ err: error }, 'Falha ao varrer cartas no e-mail');
    return apiError(error, 'documentos/cartas-email');
  }
}
