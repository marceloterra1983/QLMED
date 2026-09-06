import { NextResponse } from 'next/server';
import { idParamSchema } from '@/lib/schemas/common';
import { apiError, apiValidationError } from '@/lib/api-error';
import { getUnimedCgReversal } from '@/lib/unimed-cg/reversal-store';
import { createLogger } from '@/lib/logger';
import { requireUnimedCgPage } from '@/lib/unimed-cg/access';

const log = createLogger('gestao/unimed-cg/reversao/:id');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) return apiValidationError(parsed.error);

    const access = await requireUnimedCgPage();
    if (!access.ok) return access.response;

    const row = await getUnimedCgReversal(access.companyId, parsed.data.id);
    if (!row) {
      return NextResponse.json({ error: 'Reversão de processo não encontrada' }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      processId: row.processId,
      authorizationNumber: row.authorizationNumber,
      procedureDate: row.procedureDate,
      patientName: row.patientName,
      location: row.location,
      procedureType: row.procedureType,
      receivedAt: row.receivedAt,
      fileName: row.fileName,
      parseStatus: row.parseStatus,
      sourceUrl: row.sourceUrl,
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao carregar reversão Unimed CG');
    return apiError(error, 'gestao/unimed-cg/reversao/:id');
  }
}
