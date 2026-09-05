import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { listPendingGroups, setManualLink } from '@/lib/nfe-item-link/store';

/** SPEC-047: pendências agrupadas (fornecedor + cProd) para a tela de vínculos. */
export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { searchParams } = new URL(req.url);
    const result = await listPendingGroups({
      companyId: company.id,
      search: searchParams.get('search') || undefined,
      limit: Number(searchParams.get('limit') || 50),
      offset: Number(searchParams.get('offset') || 0),
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'products/nfe-item-links');
  }
}

const manualLinkSchema = z.object({
  productRegistryId: z.string().min(1),
  linkId: z.string().min(1).optional(),
  supplierCnpj: z.string().min(1).optional(),
  supplierCode: z.string().optional(),
}).refine((b) => Boolean(b.linkId) || (Boolean(b.supplierCnpj) && b.supplierCode !== undefined), {
  message: 'Informe linkId ou supplierCnpj + supplierCode',
});

/**
 * Vínculo MANUAL. `linkId` = um item; `supplierCnpj` + `supplierCode` = todos os
 * itens do fornecedor com esse cProd (ensina a memória S6 para notas futuras).
 */
export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      userId = (await requireEditor()).userId;
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const parsed = manualLinkSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await setManualLink({ companyId: company.id, userId, ...parsed.data });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }
    return apiError(error, 'products/nfe-item-links');
  }
}
