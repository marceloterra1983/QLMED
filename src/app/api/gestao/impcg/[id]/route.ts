import { NextResponse } from 'next/server';
import { z } from 'zod';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { idParamSchema } from '@/lib/schemas/common';
import { apiError, apiValidationError } from '@/lib/api-error';
import { getImpcgAuthorization, updateImpcgMissingFields } from '@/lib/impcg/store';
import { createLogger } from '@/lib/logger';
import { formatImpcgMoney, requireImpcgPage } from '@/lib/impcg/access';

const optionalText = z.string().trim().max(200).optional();

const impcgMissingFieldsSchema = z.object({
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  patientName: optionalText,
  patientRegistry: z.string().trim().max(40).optional().nullable(),
  doctorName: optionalText,
  doctorCrm: z.string().trim().max(20).optional().nullable(),
  procedureName: optionalText,
  hospitalName: optionalText,
});

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
      editedFields: row.editedFields,
      canEdit: access.canSync,
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

export async function PATCH(
  req: Request,
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
    const parsedId = idParamSchema.safeParse({ id });
    if (!parsedId.success) return apiValidationError(parsedId.error);

    const access = await requireImpcgPage();
    if (!access.ok) return access.response;
    if (!access.canSync) return forbiddenResponse();

    const body = impcgMissingFieldsSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return apiValidationError(body.error);

    const issuedAt = body.data.issuedAt
      ? new Date(`${body.data.issuedAt}T00:00:00.000Z`)
      : undefined;
    if (issuedAt && Number.isNaN(issuedAt.getTime())) {
      return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
    }

    const row = await updateImpcgMissingFields(access.companyId, parsedId.data.id, {
      issuedAt,
      patientName: body.data.patientName,
      patientRegistry: body.data.patientRegistry,
      doctorName: body.data.doctorName,
      doctorCrm: body.data.doctorCrm,
      procedureName: body.data.procedureName,
      hospitalName: body.data.hospitalName,
    });
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
      parseMissingReason: row.parseMissingReason,
      editedFields: row.editedFields,
      canEdit: true,
      items: row.items,
    });
  } catch (error) {
    log.error({ err: error }, 'Falha ao completar autorização IMPCG');
    return apiError(error, 'gestao/impcg/:id');
  }
}
