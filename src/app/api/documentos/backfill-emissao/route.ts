import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as auth from '@/lib/auth';
import { apiValidationError } from '@/lib/api-error';
import { sanitizeError } from '@/lib/background-service-health';
import { createLogger } from '@/lib/logger';
import { canWriteDocumentos, requireDocumentosPage } from '@/lib/documentos/access';
import { clampBackfillEmissaoLimite, runBackfillEmissao } from '@/lib/documentos/backfill-emissao';

const log = createLogger('documentos/backfill-emissao');

const bodySchema = z
  .object({
    limite: z.number().finite().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    await auth.requireEditor();
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return auth.forbiddenResponse();
    return auth.unauthorizedResponse();
  }

  try {
    const access = await requireDocumentosPage();
    if (!access.ok) return access.response;
    if (!canWriteDocumentos(access.role)) return auth.forbiddenResponse();

    let json: unknown = {};
    const text = await request.text();
    if (text.trim()) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 });
      }
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await runBackfillEmissao(access.companyId, {
      limite: clampBackfillEmissaoLimite(parsed.data.limite),
    });
    return NextResponse.json(result);
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'backfill falhou';
    log.error({ err: sanitizeError(raw) }, 'Falha ao preencher emissões');
    return NextResponse.json({ error: 'Falha ao preencher emissões' }, { status: 500 });
  }
}
