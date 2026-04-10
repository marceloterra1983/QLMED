import { NextRequest, NextResponse } from 'next/server';
import { lookupCnpj } from '@/lib/cnpj-lookup';
import { createLogger } from '@/lib/logger';

const log = createLogger('cnpj/:cnpj');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cnpj: string }> },
) {
  const { cnpj } = await params;
  const digits = (cnpj || '').replace(/\D/g, '');

  if (digits.length !== 14) {
    return NextResponse.json(
      { error: 'CNPJ inválido. Informe exatamente 14 dígitos.' },
      { status: 400 },
    );
  }

  try {
    const refresh = _req.nextUrl.searchParams.get('refresh') === '1';
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
