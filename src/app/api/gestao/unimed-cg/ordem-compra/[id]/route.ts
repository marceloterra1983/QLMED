import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAuth, unauthorizedResponse } from '@/lib/auth';
import { idParamSchema } from '@/lib/schemas/common';
import { apiError, apiValidationError } from '@/lib/api-error';
import { getUnimedCgPurchaseOrder } from '@/lib/unimed-cg/purchase-order-store';
import { createLogger } from '@/lib/logger';
import { requireUnimedCgPage } from '@/lib/unimed-cg/access';

const log = createLogger('gestao/unimed-cg/ordem-compra/:id');

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

    const row = await getUnimedCgPurchaseOrder(access.companyId, parsed.data.id);
    if (!row) {
      return NextResponse.json({ error: 'Ordem de compra não encontrada' }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (error) {
    log.error({ err: error }, 'Falha ao carregar ordem de compra Unimed CG');
    return apiError(error, 'gestao/unimed-cg/ordem-compra/:id');
  }
}
