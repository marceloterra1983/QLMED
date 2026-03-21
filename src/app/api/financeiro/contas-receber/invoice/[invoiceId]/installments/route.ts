import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';

interface InstallmentInput {
  dupNumero?: unknown;
  dupVencimento?: unknown;
  dupValor?: unknown;
  dupDesconto?: unknown;
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseMoney(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  if (!text) return Number.NaN;

  const sanitized = text
    .replace(/\s+/g, '')
    .replace(/R\$/gi, '')
    .replace(/[^0-9,.-]/g, '');

  const normalized = (() => {
    if (sanitized.includes(',')) {
      return sanitized.replace(/\./g, '').replace(',', '.');
    }
    if (!sanitized.includes('.')) {
      return sanitized;
    }
    const parts = sanitized.split('.');
    const decimalPart = parts[parts.length - 1];
    if (decimalPart.length <= 2) {
      return `${parts.slice(0, -1).join('')}.${decimalPart}`;
    }
    return parts.join('');
  })();

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeDupNumero(value: unknown, index: number): string {
  const text = String(value ?? '').trim();
  if (text) return text.slice(0, 100);
  return String(index + 1).padStart(3, '0');
}

function getNetInstallmentValue(valor: number, desconto: number): number {
  return roundMoney(Math.max(0, valor - desconto));
}

export async function PUT(
  req: Request,
  { params }: { params: { invoiceId: string } }
) {
  try {
    let userId: string;
    try {
      const auth = await requireEditor();
      userId = auth.userId;
    } catch (e: any) {
      if (e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const invoiceId = String(params?.invoiceId || '').trim();
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId é obrigatório.' }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        companyId: company.id,
      },
      select: {
        id: true,
        totalValue: true,
      },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'Nota não encontrada para a empresa.' }, { status: 404 });
    }

    const body = await req.json();
    const installmentsRaw = Array.isArray(body?.installments)
      ? (body.installments as InstallmentInput[])
      : null;
    if (!installmentsRaw || installmentsRaw.length === 0) {
      return NextResponse.json({ error: 'Informe ao menos uma parcela.' }, { status: 400 });
    }

    const seenDupNumero = new Set<string>();
    const installments = installmentsRaw.map((item: InstallmentInput, index: number) => {
      const dupNumero = normalizeDupNumero(item?.dupNumero, index);
      if (seenDupNumero.has(dupNumero)) {
        throw new Error(`Parcela duplicada (${dupNumero}).`);
      }
      seenDupNumero.add(dupNumero);

      const dupVencimento = String(item?.dupVencimento || '').trim();
      if (!isDateKey(dupVencimento)) {
        throw new Error(`Vencimento inválido na parcela ${dupNumero}.`);
      }

      const parsedValor = parseMoney(item?.dupValor);
      if (!Number.isFinite(parsedValor) || parsedValor < 0) {
        throw new Error(`Valor inválido na parcela ${dupNumero}.`);
      }
      const parsedDesconto = parseMoney(item?.dupDesconto ?? 0);
      if (!Number.isFinite(parsedDesconto) || parsedDesconto < 0) {
        throw new Error(`Desconto inválido na parcela ${dupNumero}.`);
      }
      if (parsedDesconto > parsedValor) {
        throw new Error(`Desconto maior que o valor na parcela ${dupNumero}.`);
      }

      return {
        dupNumero,
        dupVencimento,
        dupValor: roundMoney(parsedValor),
        dupDesconto: roundMoney(parsedDesconto),
      };
    });

    const totalParcelas = roundMoney(
      installments.reduce(
        (sum: number, item: { dupValor: number; dupDesconto: number }) => sum + getNetInstallmentValue(item.dupValor, item.dupDesconto),
        0
      )
    );
    const totalNota = roundMoney(Number(invoice.totalValue) || 0);
    const diff = roundMoney(totalNota - totalParcelas);
    if (Math.abs(diff) > 0.01) {
      return NextResponse.json(
        {
          error: `A soma das parcelas (${totalParcelas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) deve bater com o valor da nota (${totalNota.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`,
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.financeiroDuplicataManualInstallment.deleteMany({
        where: {
          companyId: company.id,
          invoiceId: invoice.id,
        },
      });

      await tx.financeiroDuplicataManualInstallment.createMany({
        data: installments.map((item: { dupNumero: string; dupVencimento: string; dupValor: number; dupDesconto: number }) => ({
          companyId: company.id,
          invoiceId: invoice.id,
          dupNumero: item.dupNumero,
          dupVencimento: item.dupVencimento,
          dupValor: item.dupValor,
          dupDesconto: item.dupDesconto,
        })),
      });

      await tx.financeiroDuplicataOverride.deleteMany({
        where: {
          companyId: company.id,
          invoiceId: invoice.id,
        },
      });
    });

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      installmentsCount: installments.length,
      totalParcelas,
      totalNota,
    });
  } catch (error) {
    if (error instanceof Error) {
      const validationErrorRegex = /(parcela|vencimento|valor|desconto|soma|invoiceId|obrigat|informe)/i;
      if (validationErrorRegex.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      console.error('Error saving invoice installments:', error);
      return NextResponse.json({ error: 'Erro ao salvar parcelas.' }, { status: 500 });
    }
    console.error('Unknown error saving invoice installments:', error);
    return NextResponse.json({ error: 'Erro ao salvar parcelas.' }, { status: 500 });
  }
}
