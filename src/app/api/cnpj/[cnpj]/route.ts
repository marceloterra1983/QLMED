import { NextRequest, NextResponse } from 'next/server';
import { lookupCnpj } from '@/lib/cnpj-lookup';
import { createLogger } from '@/lib/logger';
import { forbiddenResponse, requireAuth, requireEditor, unauthorizedResponse } from '@/lib/auth';

const log = createLogger('cnpj/:cnpj');

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cnpj: string }> },
) {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const { cnpj } = await params;
  const digits = (cnpj || '').replace(/\D/g, '');

  if (digits.length !== 14) {
    return NextResponse.json(
      { error: 'CNPJ inválido. Informe exatamente 14 dígitos.' },
      { status: 400 },
    );
  }

  try {
    const refresh = req.nextUrl.searchParams.get('refresh') === '1';
    if (refresh) {
      try {
        await requireEditor();
      } catch (err) {
        if (err instanceof Error && err.message === 'FORBIDDEN') return forbiddenResponse();
        return unauthorizedResponse();
      }
    }
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
