import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { idParamSchema } from '@/lib/schemas/common';
import { apiError, apiValidationError } from '@/lib/api-error';
import { getUnimedCgDelivery } from '@/lib/unimed-cg/delivery-store';
import { createLogger } from '@/lib/logger';
import { requireUnimedCgPage } from '@/lib/unimed-cg/access';

const log = createLogger('gestao/unimed-cg/entrega/:id');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const row = await getUnimedCgDelivery(access.companyId, parsed.data.id);
    if (!row) {
      return NextResponse.json({ error: 'Autorização de entrega não encontrada' }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      processId: row.processId,
      principalAuthorization: row.principalAuthorization,
      status: row.status,
      authorizedAt: row.authorizedAt,
      patientName: row.patientName,
      supplier: row.supplier,
      receivedAt: row.receivedAt,
      fileName: row.fileName,
      parseStatus: row.parseStatus,
      sourceUrl: row.sourceUrl,
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao carregar autorização de entrega Unimed CG');
    return apiError(error, 'gestao/unimed-cg/entrega/:id');
  }
}
