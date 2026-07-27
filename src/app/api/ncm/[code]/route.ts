import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupNcm } from '@/lib/ncm-lookup';
import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';

const log = createLogger('ncm/:code');

const ncmCodeParamSchema = z.object({
  code: z.preprocess(
    (value) => String(value ?? '').replace(/\D/g, ''),
    z.string().min(4, 'NCM deve ter entre 4 e 8 dígitos').max(8, 'NCM deve ter entre 4 e 8 dígitos'),
  ),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const { code } = await params;
    const digits = (code || '').replace(/\D/g, '');
    const paramsParsed = ncmCodeParamSchema.safeParse({ code });

    if (digits.length < 4 || digits.length > 8 || !paramsParsed.success) {
      return NextResponse.json({ error: 'NCM deve ter entre 4 e 8 dígitos' }, { status: 400 });
    }

    const result = await lookupNcm(digits);

    if (!result) {
      return NextResponse.json({ error: 'NCM não encontrado' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, 'ncm/:code');
  }
}
