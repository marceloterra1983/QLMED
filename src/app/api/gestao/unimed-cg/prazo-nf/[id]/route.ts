import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { idParamSchema } from '@/lib/schemas/common';
import { apiError, apiValidationError } from '@/lib/api-error';
import { getUnimedCgInvoiceDeadline } from '@/lib/unimed-cg/invoice-deadline-store';
import { createLogger } from '@/lib/logger';
import { requireUnimedCgPage } from '@/lib/unimed-cg/access';

const log = createLogger('gestao/unimed-cg/prazo-nf/:id');

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

    const row = await getUnimedCgInvoiceDeadline(access.companyId, parsed.data.id);
    if (!row) {
      return NextResponse.json({ error: 'Prazo de nota fiscal não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      processId: row.processId,
      patientName: row.patientName,
      receivedAt: row.receivedAt,
      fileName: row.fileName,
      parseStatus: row.parseStatus,
      sourceUrl: row.sourceUrl,
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao carregar prazo NF Unimed CG');
    return apiError(error, 'gestao/unimed-cg/prazo-nf/:id');
  }
}
