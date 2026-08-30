import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { idParamSchema } from '@/lib/schemas/common';
import { apiError, apiValidationError } from '@/lib/api-error';
import { getImpcgAuthorization } from '@/lib/impcg/store';
import { createLogger } from '@/lib/logger';
import { formatImpcgMoney, requireImpcgPage } from '@/lib/impcg/access';

const log = createLogger('gestao/impcg/:id');

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

    const access = await requireImpcgPage();
    if (!access.ok) return access.response;

    const row = await getImpcgAuthorization(access.companyId, parsed.data.id);
    if (!row) {
      return NextResponse.json({ error: 'Autorização não encontrada' }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      issuedAt: row.issuedAt,
      oficioNumber: row.oficioNumber,
      patientName: row.patientName,
      patientRegistry: row.patientRegistry,
      doctorName: row.doctorName,
      doctorCrm: row.doctorCrm,
      procedureName: row.procedureName,
      hospitalName: row.hospitalName,
      totalAmount: formatImpcgMoney(row.totalAmount),
      fileName: row.fileName,
      parseStatus: row.parseStatus,
      parseMissingReason: row.parseMissingReason ?? null,
      items: row.items.map((item) => ({
        anvisaCode: item.anvisaCode,
        description: item.description,
        brand: item.brand,
        reference: item.reference,
        quantity: item.quantity,
        unitAmount: formatImpcgMoney(item.unitAmount),
        lineTotal: formatImpcgMoney(item.lineTotal),
      })),
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao carregar autorização IMPCG');
    return apiError(error, 'gestao/impcg/:id');
  }
}
