import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-error');

/**
 * Helper padronizado para catch blocks em API routes.
 * Loga o erro com contexto e retorna NextResponse 500.
 */
export function apiError(e: unknown, context?: string): NextResponse {
  const meta: Record<string, unknown> = {};
  if (context) meta.context = context;

  if (e instanceof Error) {
    log.error({ ...meta, err: e }, e.message);
  } else if (typeof e === 'string') {
    log.error({ ...meta }, e);
  } else {
    log.error({ ...meta, raw: JSON.stringify(e) }, 'Erro desconhecido');
  }

  return NextResponse.json(
    { error: 'Erro interno do servidor' },
    { status: 500 },
  );
}

/**
 * Helper para erros de validacao Zod.
 * Retorna NextResponse 400 com detalhes dos campos invalidos.
 */
export function apiValidationError(errors: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: 'Dados invalidos',
      details: errors.flatten().fieldErrors,
    },
    { status: 400 },
  );
}
