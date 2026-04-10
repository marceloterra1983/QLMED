import { NextResponse } from 'next/server';
import { z } from 'zod';

// Rota desabilitada — safeParse para consistencia com padrao de validacao
const registerSchema = z.object({}).optional();

export async function POST() {
  registerSchema.safeParse({});
  return NextResponse.json({ error: 'Cadastro desabilitado' }, { status: 403 });
}
