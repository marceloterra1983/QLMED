import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupCnpj } from '@/lib/cnpj-lookup';
import { createLogger } from '@/lib/logger';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { cnpjSchema } from '@/lib/schemas/common';

const log = createLogger('cnpj/:cnpj');

const cnpjParamSchema = z.object({
  cnpj: z.preprocess((value) => String(value ?? '').replace(/\D/g, ''), cnpjSchema),
});

const cnpjQuerySchema = z.object({
  refresh: z.enum(['0', '1']).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cnpj: string }> },
) {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const { cnpj } = await params;
  const digits = (cnpj || '').replace(/\D/g, '');
  const paramsParsed = cnpjParamSchema.safeParse({ cnpj });

  if (digits.length !== 14 || !paramsParsed.success) {
    return NextResponse.json(
      { error: 'CNPJ inválido. Informe exatamente 14 dígitos.' },
      { status: 400 },
    );
  }

  try {
    const queryParsed = cnpjQuerySchema.safeParse(Object.fromEntries(_req.nextUrl.searchParams));
    const refresh = queryParsed.success && queryParsed.data.refresh === '1';
    const result = await lookupCnpj(digits, refresh);
    if (!result) {
      return NextResponse.json({ error: 'CNPJ não encontrado' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err: err }, '[api/cnpj] Error');
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
