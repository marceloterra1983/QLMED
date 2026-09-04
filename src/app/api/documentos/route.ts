import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { requireDocumentosPage } from '@/lib/documentos/access';
import { loadDocumentosListing } from '@/lib/documentos/list';

const log = createLogger('documentos');

export async function GET() {
  try {
    await requireAuth();
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  try {
    const access = await requireDocumentosPage();
    if (!access.ok) return access.response;

    const listing = await loadDocumentosListing(access.companyId);
    return NextResponse.json(listing);
  } catch (error) {
    log.error({ err: error }, 'Falha ao listar documentos');
    return apiError(error, 'documentos');
  }
}
