import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Cadastro desabilitado' }, { status: 403 });
}
