import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createLogger } from '@/lib/logger';
import { PayloadTooLargeError } from '@/lib/upload-limits';
import { XlsxTooLargeError } from '@/lib/xlsx-limits';

const log = createLogger('api-error');

/**
 * Helper padronizado para catch blocks em API routes.
 * Loga o erro com contexto e retorna NextResponse 500.
 */
export function apiError(e: unknown, context?: string): NextResponse {
  if (e instanceof Error) {
    if (e.message === 'NOT_AUTHENTICATED') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }
  }

  // Limites de upload aplicados no stream/antes do unzip (auditoria L5).
  if (e instanceof PayloadTooLargeError || e instanceof XlsxTooLargeError) {
    return NextResponse.json({ error: e.message }, { status: 413 });
  }

  const meta: Record<string, unknown> = {};
  if (context) meta.context = context;

  // A `msg` do pino NUNCA passa pelo `redact` — é string, não campo. Usar
  // `e.message` ali punha o segredo em claro no log de 500 de praticamente
  // todas as rotas: um erro de driver que ecoa a connection string, uma
  // mensagem que cita o token. Rótulo fixo na `msg`; a mensagem vai dentro de
  // `err`, onde o redact alcança. Achado REAUD-B-09.
  if (e instanceof Error) {
    log.error({ ...meta, err: e }, 'Erro na rota');
  } else if (typeof e === 'string') {
    log.error({ ...meta, raw: e }, 'Erro na rota');
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
