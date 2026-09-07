import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { recordManualMovement } from '@/lib/stock-ledger';
import { estoqueAjusteSchema } from '@/lib/schemas/estoque';

export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      ({ userId } = await requireEditor());
    } catch (err) {
      if (err instanceof Error && err.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const body = await req.json();
    const parsed = estoqueAjusteSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const count = await recordManualMovement({
      companyId: company.id,
      productCodigo: parsed.data.productCodigo,
      productName: parsed.data.productName,
      lot: parsed.data.lot,
      lotExpiry: parsed.data.lotExpiry,
      quantity: parsed.data.quantity,
      kind: parsed.data.kind,
      direction: parsed.data.direction,
      locationType: parsed.data.locationType,
      locationCnpj: parsed.data.locationCnpj,
      locationName: parsed.data.locationName,
      reason: parsed.data.reason,
      createdBy: userId,
    });

    return NextResponse.json({ ok: true, count });
  } catch (error) {
    return apiError(error, 'estoque/controle/ajuste');
  }
}
