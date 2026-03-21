import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { getFinanceiroDuplicatas } from '@/lib/financeiro-duplicatas';
import prisma from '@/lib/prisma';

type DuplicataStatus = 'overdue' | 'due_today' | 'due_soon' | 'upcoming';

interface ContasReceberDuplicata {
  invoiceId: string;
  accessKey: string;
  nfNumero: string;
  clienteCnpj: string;
  clienteNome: string;
  nfEmissao: Date;
  nfValorTotal: number;
  faturaNumero: string;
  faturaValorOriginal: number;
  faturaValorLiquido: number;
  dupNumero: string;
  dupNumeroOriginal: string;
  dupVencimento: string;
  dupVencimentoOriginal: string;
  dupValor: number;
  dupDesconto?: number;
  status: DuplicataStatus;
  diasAtraso: number;
  diasParaVencer: number;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getNetInstallmentValue(valor: number, desconto: number): number {
  return roundMoney(Math.max(0, valor - desconto));
}

function toEpochDay(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return Number.NaN;
  return Math.floor(Date.UTC(year, month - 1, day) / (1000 * 60 * 60 * 24));
}

function getStatusFromVencimento(vencimentoKey: string, todayEpochDay: number) {
  const vencimentoEpochDay = toEpochDay(vencimentoKey);
  if (!Number.isFinite(vencimentoEpochDay)) {
    return {
      status: 'upcoming' as DuplicataStatus,
      diasAtraso: 0,
      diasParaVencer: 0,
    };
  }

  const diffDays = vencimentoEpochDay - todayEpochDay;
  let status: DuplicataStatus;
  if (diffDays < 0) status = 'overdue';
  else if (diffDays === 0) status = 'due_today';
  else if (diffDays <= 7) status = 'due_soon';
  else status = 'upcoming';

  return {
    status,
    diasAtraso: diffDays < 0 ? Math.abs(diffDays) : 0,
    diasParaVencer: diffDays > 0 ? diffDays : 0,
  };
}

export async function GET(
  req: Request,
  { params }: { params: { invoiceId: string } }
) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.invoiceId,
        companyId: company.id,
      },
      select: {
        id: true,
        number: true,
        issueDate: true,
        totalValue: true,
        recipientName: true,
        recipientCnpj: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });
    }

    const baseDuplicatas = (await getFinanceiroDuplicatas(company.id, 'issued'))
      .filter((item) => item.invoiceId === invoice.id);

    const manualInstallments = await prisma.financeiroDuplicataManualInstallment.findMany({
      where: {
        companyId: company.id,
        invoiceId: invoice.id,
      },
      orderBy: [
        { dupVencimento: 'asc' },
        { dupNumero: 'asc' },
      ],
      select: {
        dupNumero: true,
        dupVencimento: true,
        dupValor: true,
        dupDesconto: true,
      },
    });

    type ExpandedDuplicata = (typeof baseDuplicatas)[number] & { dupDesconto?: number };
    const expandedDuplicatas: ExpandedDuplicata[] = (() => {
      if (baseDuplicatas.length === 0) return [];
      if (manualInstallments.length === 0) return baseDuplicatas as ExpandedDuplicata[];
      const seed = baseDuplicatas[0];
      return manualInstallments.map((parcela) => ({
        ...seed,
        dupNumero: parcela.dupNumero,
        dupVencimento: parcela.dupVencimento,
        dupValor: getNetInstallmentValue(Number(parcela.dupValor), Number(parcela.dupDesconto) || 0),
        dupDesconto: Number(parcela.dupDesconto) || 0,
      }));
    })();

    const overrides = await prisma.financeiroDuplicataOverride.findMany({
      where: {
        companyId: company.id,
        invoiceId: invoice.id,
      },
      select: {
        invoiceId: true,
        dupNumeroOriginal: true,
        dupVencimentoOriginal: true,
        emitenteNome: true,
        emitenteCnpj: true,
        faturaNumero: true,
        dupNumero: true,
        dupVencimento: true,
        dupValor: true,
      },
    });
    const overridesByKey = new Map(
      overrides.map((item) => [
        `${item.invoiceId}::${item.dupNumeroOriginal}::${item.dupVencimentoOriginal}`,
        item,
      ])
    );

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayEpochDay = toEpochDay(todayKey);

    const duplicatas: ContasReceberDuplicata[] = expandedDuplicatas.map((item) => {
      const override = overridesByKey.get(`${item.invoiceId}::${item.dupNumero}::${item.dupVencimento}`);
      const clienteNome = override?.emitenteNome?.trim() || item.partyNome || '';
      const clienteCnpj = override?.emitenteCnpj?.trim() || item.partyCnpj || '';
      const faturaNumero = override?.faturaNumero?.trim() || item.faturaNumero;
      const dupNumero = override?.dupNumero?.trim() || item.dupNumero;
      const vencimento = override?.dupVencimento?.trim() || item.dupVencimento;
      const dupValor = override?.dupValor != null ? Number(override.dupValor) : item.dupValor;
      const statusInfo = getStatusFromVencimento(vencimento, todayEpochDay);

      return {
        invoiceId: item.invoiceId,
        accessKey: item.accessKey,
        nfNumero: item.nfNumero,
        clienteCnpj,
        clienteNome,
        nfEmissao: item.nfEmissao,
        nfValorTotal: item.nfValorTotal,
        faturaNumero,
        faturaValorOriginal: item.faturaValorOriginal,
        faturaValorLiquido: item.faturaValorLiquido,
        dupNumero,
        dupNumeroOriginal: item.dupNumero,
        dupVencimento: vencimento,
        dupVencimentoOriginal: item.dupVencimento,
        dupValor,
        dupDesconto: item.dupDesconto || 0,
        status: statusInfo.status,
        diasAtraso: statusInfo.diasAtraso,
        diasParaVencer: statusInfo.diasParaVencer,
      };
    }).sort((a, b) => {
      const dayA = toEpochDay(a.dupVencimento);
      const dayB = toEpochDay(b.dupVencimento);
      if (Number.isFinite(dayA) && Number.isFinite(dayB) && dayA !== dayB) {
        return dayA - dayB;
      }
      return a.dupNumero.localeCompare(b.dupNumero);
    });

    const headerClienteNome = duplicatas[0]?.clienteNome || invoice.recipientName || '';
    const headerClienteCnpj = duplicatas[0]?.clienteCnpj || invoice.recipientCnpj || '';

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        number: invoice.number,
        issueDate: invoice.issueDate,
        totalValue: Number(invoice.totalValue),
        clienteNome: headerClienteNome,
        clienteCnpj: headerClienteCnpj,
      },
      duplicatas,
    });
  } catch (error) {
    console.error('Error fetching contas receber invoice details:', error);
    return NextResponse.json({ error: 'Erro ao buscar detalhes da nota' }, { status: 500 });
  }
}
