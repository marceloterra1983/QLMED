import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { upsertProductRegistry } from '@/lib/product-registry-store';
import { cleanString } from '@/lib/utils';
import { apiError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';

const log = createLogger('products/anvisa');

function normalizeAnvisaCode(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length !== 11) return null;
  return digits;
}

export async function PATCH(req: Request) {
  try {
    let userId: string;
    try {
      const auth = await requireEditor();
      userId = auth.userId;
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const body = await req.json().catch(() => null);

    const productKey = cleanString(body?.productKey);
    const description = cleanString(body?.description);
    const anvisaCode = normalizeAnvisaCode(body?.anvisa);

    if (!productKey || !description) {
      return NextResponse.json(
        { error: 'productKey e description são obrigatórios' },
        { status: 400 },
      );
    }

    if ((body?.anvisa ?? '') && !anvisaCode) {
      return NextResponse.json(
        { error: 'Código ANVISA inválido. Informe exatamente 11 dígitos.' },
        { status: 400 },
      );
    }

    const code = cleanString(body?.code);
    const ncm = cleanString(body?.ncm);
    const unit = cleanString(body?.unit);
    const ean = cleanString(body?.ean);

    const payload = {
      code,
      description,
      ncm,
      unit,
      ean,
      anvisaCode,
      anvisaSource: 'manual',
      anvisaConfidence: anvisaCode ? 1 : null,
      anvisaMatchedProductName: null,
      anvisaHolder: null,
      anvisaProcess: null,
      anvisaStatus: anvisaCode ? 'Definido manualmente' : 'Removido manualmente',
      anvisaSyncedAt: new Date(),
    };

    await upsertProductRegistry({
      companyId: company.id,
      productKey,
      ...payload,
    });

    return NextResponse.json({
      ok: true,
      productKey,
      anvisaCode,
      anvisaSource: 'manual',
      updatedAt: new Date(),
    });
  } catch (error) {
    return apiError(error, 'products/anvisa');
  }
}
