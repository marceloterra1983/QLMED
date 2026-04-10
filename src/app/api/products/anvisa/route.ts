import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { upsertProductRegistry } from '@/lib/product-registry-store';
import { cleanString } from '@/lib/utils';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { anvisaPatchSchema } from '@/lib/schemas/product';

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

    const parsed = anvisaPatchSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const productKey = cleanString(parsed.data.productKey);
    const description = cleanString(parsed.data.description);
    const anvisaCode = normalizeAnvisaCode(parsed.data.anvisa);

    if (!productKey || !description) {
      return NextResponse.json(
        { error: 'productKey e description são obrigatórios' },
        { status: 400 },
      );
    }

    if ((parsed.data.anvisa ?? '') && !anvisaCode) {
      return NextResponse.json(
        { error: 'Código ANVISA inválido. Informe exatamente 11 dígitos.' },
        { status: 400 },
      );
    }

    const code = cleanString(parsed.data.code);
    const ncm = cleanString(parsed.data.ncm);
    const unit = cleanString(parsed.data.unit);
    const ean = cleanString(parsed.data.ean);

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
