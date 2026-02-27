import { NextRequest, NextResponse } from 'next/server';
import { lookupNcm } from '@/lib/ncm-lookup';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const digits = (code || '').replace(/\D/g, '');

    if (digits.length < 4 || digits.length > 8) {
      return NextResponse.json({ error: 'NCM deve ter entre 4 e 8 dígitos' }, { status: 400 });
    }

    const result = await lookupNcm(digits);

    if (!result) {
      return NextResponse.json({ error: 'NCM não encontrado' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[ncm/lookup] Error:', error);
    return NextResponse.json({ error: 'Erro ao buscar NCM' }, { status: 500 });
  }
}
