import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { overrideSchema } from '@/lib/schemas/financeiro';

const log = createLogger('financeiro/contas-pagar/override');

function normalizeOptionalText(value: unknown, maxLen = 255): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLen);
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function PATCH(req: Request) {
  try {
    let userId: string;
    try {
      const auth = await requireEditor();
      userId = auth.userId;
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const body = await req.json();
    const parsed = overrideSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const invoiceId = parsed.data.invoiceId.trim();
    const dupNumeroOriginal = parsed.data.dupNumeroOriginal.trim();
    const dupVencimentoOriginal = parsed.data.dupVencimentoOriginal.trim();

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        companyId: company.id,
      },
      select: { id: true },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'Nota não encontrada para a empresa' }, { status: 404 });
    }

    const emitenteNome = normalizeOptionalText(body?.emitenteNome, 255);
    const emitenteCnpjRaw = normalizeOptionalText(body?.emitenteCnpj, 32);
    const emitenteCnpj = emitenteCnpjRaw ? emitenteCnpjRaw.replace(/\D/g, '') : null;
    if (emitenteCnpj && emitenteCnpj.length !== 14) {
      return NextResponse.json({ error: 'CNPJ inválido. Informe 14 dígitos.' }, { status: 400 });
    }
    const faturaNumero = normalizeOptionalText(body?.faturaNumero, 100);
    const dupNumero = normalizeOptionalText(body?.dupNumero, 100);
    const dupVencimento = normalizeOptionalText(body?.dupVencimento, 10);
    if (dupVencimento && !isDateKey(dupVencimento)) {
      return NextResponse.json({ error: 'Vencimento inválido. Use o formato YYYY-MM-DD.' }, { status: 400 });
    }

    let dupValor: number | null = null;
    if (body?.dupValor != null && String(body.dupValor).trim() !== '') {
      const parsed = Number(String(body.dupValor).replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json({ error: 'Valor da duplicata inválido.' }, { status: 400 });
      }
      dupValor = parsed;
    }

    const override = await prisma.financeiroDuplicataOverride.upsert({
      where: {
        companyId_invoiceId_dupNumeroOriginal_dupVencimentoOriginal: {
          companyId: company.id,
          invoiceId,
          dupNumeroOriginal,
          dupVencimentoOriginal,
        },
      },
      update: {
        emitenteNome,
        emitenteCnpj,
        faturaNumero,
        dupNumero,
        dupVencimento,
        dupValor,
      },
      create: {
        companyId: company.id,
        invoiceId,
        dupNumeroOriginal,
        dupVencimentoOriginal,
        emitenteNome,
        emitenteCnpj,
        faturaNumero,
        dupNumero,
        dupVencimento,
        dupValor,
      },
    });

    return NextResponse.json({ success: true, override: { ...override, dupValor: override.dupValor != null ? Number(override.dupValor) : null } });
  } catch (error) {
    return apiError(error, 'financeiro/contas-pagar/override');
  }
}
