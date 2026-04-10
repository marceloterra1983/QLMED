/**
 * Shared financeiro logic parametrized by direction (pagar/receber).
 * Eliminates duplication between contas-pagar and contas-receber routes.
 */
import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('financeiro-shared');
import { getFinanceiroDuplicatas } from '@/lib/financeiro-duplicatas';
import { normalizeForSearch, flexMatchAll } from '@/lib/utils';
import prisma from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FinanceiroDirection = 'pagar' | 'receber';
type DuplicataStatus = 'overdue' | 'due_today' | 'due_soon' | 'upcoming';

const VENCIMENTO_PRIORITY_ASC: Record<DuplicataStatus, number> = {
  due_today: 0,
  due_soon: 1,
  upcoming: 2,
  overdue: 3,
};

interface ContasDuplicata {
  invoiceId: string;
  accessKey: string;
  nfNumero: string;
  partyCnpj: string;
  partyNome: string;
  partyNomeAbreviado: string;
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
  parcelaTotal: number;
}

interface Company {
  id: string;
  cnpj: string;
  [key: string]: unknown;
}

interface InstallmentInput {
  dupNumero?: unknown;
  dupVencimento?: unknown;
  dupValor?: unknown;
  dupDesconto?: unknown;
}

// ---------------------------------------------------------------------------
// Direction config
// ---------------------------------------------------------------------------

const DIRECTION_CONFIG = {
  pagar: {
    partyFieldCnpj: 'emitenteCnpj' as const,
    partyFieldNome: 'emitenteNome' as const,
    partyFieldAbreviado: 'emitenteNomeAbreviado' as const,
    invoiceDirections: ['received'] as const,
    allowedTags: ['Compra', 'Venda', 'Compra Importação'] as string[],
    includeIssuedImport: true,
    partySortField: 'emitente' as const,
    invoiceSelectExtra: {
      direction: true,
      senderName: true,
      senderCnpj: true,
      recipientName: true,
      recipientCnpj: true,
    },
    errorLabel: 'contas a pagar',
    errorLabelInvoice: 'contas pagar invoice details',
  },
  receber: {
    partyFieldCnpj: 'clienteCnpj' as const,
    partyFieldNome: 'clienteNome' as const,
    partyFieldAbreviado: 'clienteNomeAbreviado' as const,
    invoiceDirections: ['issued'] as const,
    allowedTags: undefined as string[] | undefined,
    includeIssuedImport: false,
    partySortField: 'cliente' as const,
    invoiceSelectExtra: {
      recipientName: true,
      recipientCnpj: true,
    },
    errorLabel: 'contas a receber',
    errorLabelInvoice: 'contas receber invoice details',
  },
} as const;

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

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

function matchesStatusFilter(status: DuplicataStatus, statusFilter: string) {
  if (!statusFilter || statusFilter === 'all') return true;
  if (statusFilter === 'overdue') return status === 'overdue';
  if (statusFilter === 'due_today') return status === 'due_today';
  if (statusFilter === 'due_soon') return status === 'due_soon' || status === 'due_today';
  if (statusFilter === 'upcoming') return status === 'upcoming' || status === 'due_soon' || status === 'due_today';
  return true;
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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

// ---------------------------------------------------------------------------
// Shared helper: fetch base duplicatas for direction
// ---------------------------------------------------------------------------

async function fetchBaseDuplicatas(companyId: string, direction: FinanceiroDirection) {
  const config = DIRECTION_CONFIG[direction];
  if (config.includeIssuedImport) {
    const [received, issuedImport] = await Promise.all([
      getFinanceiroDuplicatas(companyId, 'received', {
        allowedTags: ['Compra', 'Venda', 'Compra Importação'],
      }),
      getFinanceiroDuplicatas(companyId, 'issued', {
        allowedTags: ['Compra Importação'],
      }),
    ]);
    return [...received, ...issuedImport];
  }
  return getFinanceiroDuplicatas(companyId, 'issued');
}

// ---------------------------------------------------------------------------
// Shared helper: expand duplicatas with manual installments
// ---------------------------------------------------------------------------

interface BaseDuplicata {
  invoiceId: string;
  accessKey: string;
  nfNumero: string;
  partyCnpj: string;
  partyNome: string;
  nfEmissao: Date;
  nfValorTotal: number;
  faturaNumero: string;
  faturaValorOriginal: number;
  faturaValorLiquido: number;
  dupNumero: string;
  dupVencimento: string;
  dupValor: number;
}

async function expandWithManualInstallments(
  companyId: string,
  baseDuplicatas: BaseDuplicata[],
  invoiceIds: string[]
) {
  const manualInstallments = invoiceIds.length > 0
    ? await prisma.financeiroDuplicataManualInstallment.findMany({
        where: {
          companyId,
          invoiceId: { in: invoiceIds },
        },
        select: {
          invoiceId: true,
          dupNumero: true,
          dupVencimento: true,
          dupValor: true,
          dupDesconto: true,
        },
        orderBy: [
          { invoiceId: 'asc' },
          { dupVencimento: 'asc' },
          { dupNumero: 'asc' },
        ],
      })
    : [];

  const manualByInvoice = new Map<string, typeof manualInstallments>();
  for (const item of manualInstallments) {
    const list = manualByInvoice.get(item.invoiceId);
    if (list) {
      list.push(item);
    } else {
      manualByInvoice.set(item.invoiceId, [item]);
    }
  }

  const invoiceIdsWithManual = new Set(manualByInvoice.keys());
  const expanded: (BaseDuplicata & { dupDesconto?: number })[] = [];
  const manualAppliedForInvoice = new Set<string>();

  for (const item of baseDuplicatas) {
    if (!invoiceIdsWithManual.has(item.invoiceId)) {
      expanded.push(item);
      continue;
    }
    if (manualAppliedForInvoice.has(item.invoiceId)) {
      continue;
    }
    manualAppliedForInvoice.add(item.invoiceId);
    const schedule = manualByInvoice.get(item.invoiceId) || [];
    for (const parcela of schedule) {
      expanded.push({
        ...item,
        dupNumero: parcela.dupNumero,
        dupVencimento: parcela.dupVencimento,
        dupValor: getNetInstallmentValue(
          Number(parcela.dupValor),
          Number(parcela.dupDesconto) || 0
        ),
        dupDesconto: Number(parcela.dupDesconto) || 0,
      });
    }
  }

  return { expanded, manualByInvoice };
}

// ---------------------------------------------------------------------------
// Shared helper: fetch overrides
// ---------------------------------------------------------------------------

async function fetchOverrides(companyId: string, invoiceIds: string[]) {
  const overrides = invoiceIds.length > 0
    ? await prisma.financeiroDuplicataOverride.findMany({
        where: {
          companyId,
          invoiceId: { in: invoiceIds },
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
      })
    : [];
  return new Map(
    overrides.map((item) => [
      `${item.invoiceId}::${item.dupNumeroOriginal}::${item.dupVencimentoOriginal}`,
      item,
    ])
  );
}

// ---------------------------------------------------------------------------
// Renames party fields in output based on direction
// ---------------------------------------------------------------------------

function renamePartyFields(
  obj: Record<string, unknown>,
  direction: FinanceiroDirection
): Record<string, unknown> {
  const config = DIRECTION_CONFIG[direction];
  const result = { ...obj };
  if ('partyCnpj' in result) {
    result[config.partyFieldCnpj] = result.partyCnpj;
    delete result.partyCnpj;
  }
  if ('partyNome' in result) {
    result[config.partyFieldNome] = result.partyNome;
    delete result.partyNome;
  }
  if ('partyNomeAbreviado' in result) {
    result[config.partyFieldAbreviado] = result.partyNomeAbreviado;
    delete result.partyNomeAbreviado;
  }
  return result;
}

// ---------------------------------------------------------------------------
// handleContasGet - main list route (contas-pagar/route.ts & contas-receber/route.ts)
// ---------------------------------------------------------------------------

export async function handleContasGet(
  company: Company,
  direction: FinanceiroDirection,
  searchParams: URLSearchParams
): Promise<NextResponse> {
  try {
    const config = DIRECTION_CONFIG[direction];
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(2000, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const search = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const sortBy = searchParams.get('sort') || 'vencimento';
    const sortOrder = searchParams.get('order') || 'asc';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pad2 = (value: number) => String(value).padStart(2, '0');
    const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
    const todayEpochDay = toEpochDay(todayKey);
    const thisMonthKey = todayKey.slice(0, 7);
    const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthKey = `${nextMonthDate.getFullYear()}-${pad2(nextMonthDate.getMonth() + 1)}`;
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartKey = `${weekStart.getFullYear()}-${pad2(weekStart.getMonth() + 1)}-${pad2(weekStart.getDate())}`;
    const weekEndKey = `${weekEnd.getFullYear()}-${pad2(weekEnd.getMonth() + 1)}-${pad2(weekEnd.getDate())}`;

    const baseDuplicatas = await fetchBaseDuplicatas(company.id, direction);
    const invoiceIds = Array.from(new Set(baseDuplicatas.map((item) => item.invoiceId)));

    const { expanded: expandedDuplicatas } = await expandWithManualInstallments(
      company.id,
      baseDuplicatas,
      invoiceIds
    );

    const overridesByKey = await fetchOverrides(company.id, invoiceIds);

    const searchWords = normalizeForSearch(search.trim()).split(/\s+/).filter(Boolean);

    const allNicknames = await prisma.contactNickname.findMany({
      where: { companyId: company.id },
      select: { cnpj: true, shortName: true },
    });
    const nicknameMap = new Map(allNicknames.map((n) => [n.cnpj, n.shortName]));

    const filtered: ContasDuplicata[] = [];
    const summary = {
      total: 0,
      totalValor: 0,
      hoje: 0,
      hojeValor: 0,
      estaSemana: 0,
      estaSemanaValor: 0,
      esteMes: 0,
      esteMesValor: 0,
      proximoMes: 0,
      proximoMesValor: 0,
      vencidas: 0,
      vencidasValor: 0,
      venceHoje: 0,
      venceHojeValor: 0,
      aVencer: 0,
      aVencerValor: 0,
    };

    for (const item of expandedDuplicatas) {
      const override = overridesByKey.get(
        `${item.invoiceId}::${item.dupNumero}::${item.dupVencimento}`
      );
      const partyNome = override?.emitenteNome?.trim() || item.partyNome || '';
      const partyCnpj = override?.emitenteCnpj?.trim() || item.partyCnpj || '';
      const faturaNumero = override?.faturaNumero?.trim() || item.faturaNumero;
      const dupNumero = override?.dupNumero?.trim() || item.dupNumero;
      const vencimento = override?.dupVencimento?.trim() || item.dupVencimento;
      const dupValor = override?.dupValor != null ? Number(override.dupValor) : item.dupValor;

      if (dateFrom && vencimento < dateFrom) continue;
      if (dateTo && vencimento > dateTo) continue;

      // contas-pagar filters only future; contas-receber shows all
      if (direction === 'pagar') {
        const vencimentoEpochDay = toEpochDay(vencimento);
        const isFutureVencimento =
          Number.isFinite(vencimentoEpochDay) && vencimentoEpochDay > todayEpochDay;
        if (!isFutureVencimento) continue;
      }

      const statusInfo = getStatusFromVencimento(vencimento, todayEpochDay);
      if (!matchesStatusFilter(statusInfo.status, statusFilter)) continue;
      if (
        searchWords.length > 0 &&
        !flexMatchAll(
          [partyNome, partyCnpj, item.nfNumero, dupNumero, nicknameMap.get(partyCnpj) || ''],
          searchWords
        )
      ) {
        continue;
      }

      const duplicata: ContasDuplicata = {
        invoiceId: item.invoiceId,
        accessKey: item.accessKey,
        nfNumero: item.nfNumero,
        partyCnpj,
        partyNome,
        partyNomeAbreviado: nicknameMap.get(partyCnpj) || partyNome,
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
        status: statusInfo.status,
        diasAtraso: statusInfo.diasAtraso,
        diasParaVencer: statusInfo.diasParaVencer,
        parcelaTotal: 1,
      };

      filtered.push(duplicata);

      summary.total += 1;
      summary.totalValor += duplicata.dupValor;

      if (duplicata.dupVencimento === todayKey) {
        summary.hoje += 1;
        summary.hojeValor += duplicata.dupValor;
      }
      if (duplicata.dupVencimento >= weekStartKey && duplicata.dupVencimento <= weekEndKey) {
        summary.estaSemana += 1;
        summary.estaSemanaValor += duplicata.dupValor;
      }
      if (duplicata.dupVencimento.startsWith(thisMonthKey)) {
        summary.esteMes += 1;
        summary.esteMesValor += duplicata.dupValor;
      }
      if (duplicata.dupVencimento.startsWith(nextMonthKey)) {
        summary.proximoMes += 1;
        summary.proximoMesValor += duplicata.dupValor;
      }
      if (duplicata.status === 'overdue') {
        summary.vencidas += 1;
        summary.vencidasValor += duplicata.dupValor;
      }
      if (duplicata.status === 'due_today') {
        summary.venceHoje += 1;
        summary.venceHojeValor += duplicata.dupValor;
      }
      if (duplicata.status !== 'overdue') {
        summary.aVencer += 1;
        summary.aVencerValor += duplicata.dupValor;
      }
    }

    // Group parcela counts
    const parcelaTotalByGroup = new Map<string, number>();
    for (const duplicata of filtered) {
      const key = `${duplicata.invoiceId}::${duplicata.faturaNumero || duplicata.nfNumero}`;
      parcelaTotalByGroup.set(key, (parcelaTotalByGroup.get(key) || 0) + 1);
    }
    for (const duplicata of filtered) {
      const key = `${duplicata.invoiceId}::${duplicata.faturaNumero || duplicata.nfNumero}`;
      duplicata.parcelaTotal = parcelaTotalByGroup.get(key) || 1;
    }

    // Sort
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'vencimento': {
          const dayA = toEpochDay(a.dupVencimento);
          const dayB = toEpochDay(b.dupVencimento);
          const dayCmp =
            Number.isFinite(dayA) && Number.isFinite(dayB)
              ? dayA - dayB
              : a.dupVencimento.localeCompare(b.dupVencimento);
          if (sortOrder === 'asc') {
            cmp = VENCIMENTO_PRIORITY_ASC[a.status] - VENCIMENTO_PRIORITY_ASC[b.status];
            if (cmp === 0) cmp = dayCmp;
          } else {
            cmp = dayCmp;
          }
          break;
        }
        case 'valor':
          cmp = a.dupValor - b.dupValor;
          break;
        case 'emitente':
        case 'cliente':
          cmp = a.partyNome.localeCompare(b.partyNome);
          break;
        case 'nfNumero':
          cmp = (parseInt(a.nfNumero, 10) || 0) - (parseInt(b.nfNumero, 10) || 0);
          break;
        case 'status': {
          const statusOrder: Record<DuplicataStatus, number> = {
            overdue: 0,
            due_today: 1,
            due_soon: 2,
            upcoming: 3,
          };
          cmp = statusOrder[a.status] - statusOrder[b.status];
          break;
        }
        default:
          cmp = a.dupVencimento.localeCompare(b.dupVencimento);
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    const total = filtered.length;
    const pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    // Rename party fields to direction-specific names in output
    const renamedDuplicatas = paginated.map((d) => renamePartyFields(d as unknown as Record<string, unknown>, direction));

    return NextResponse.json({
      duplicatas: renamedDuplicatas,
      summary,
      pagination: { page, limit, total, pages },
    });
  } catch (error) {
    const config = DIRECTION_CONFIG[direction];
    log.error({ err: error, label: config.errorLabel }, 'Error fetching financeiro');
    return NextResponse.json(
      { error: `Erro ao buscar ${config.errorLabel}` },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// handleInvoiceGet - invoice detail route
// ---------------------------------------------------------------------------

export async function handleInvoiceGet(
  invoiceId: string,
  company: Company,
  direction: FinanceiroDirection
): Promise<NextResponse> {
  try {
    const config = DIRECTION_CONFIG[direction];

    const invoiceSelect = {
      id: true,
      number: true,
      issueDate: true,
      totalValue: true,
      ...config.invoiceSelectExtra,
    };

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        companyId: company.id,
      },
      select: invoiceSelect,
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Nota nao encontrada' }, { status: 404 });
    }

    const baseDuplicatas = (await fetchBaseDuplicatas(company.id, direction)).filter(
      (item) => item.invoiceId === invoice.id
    );

    const manualInstallments = await prisma.financeiroDuplicataManualInstallment.findMany({
      where: {
        companyId: company.id,
        invoiceId: invoice.id,
      },
      orderBy: [{ dupVencimento: 'asc' }, { dupNumero: 'asc' }],
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
        dupValor: getNetInstallmentValue(
          Number(parcela.dupValor),
          Number(parcela.dupDesconto) || 0
        ),
        dupDesconto: Number(parcela.dupDesconto) || 0,
      }));
    })();

    const overridesByKey = await fetchOverrides(company.id, [invoice.id]);

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayEpochDay = toEpochDay(todayKey);

    const duplicatas = expandedDuplicatas
      .map((item) => {
        const override = overridesByKey.get(
          `${item.invoiceId}::${item.dupNumero}::${item.dupVencimento}`
        );
        const partyNome = override?.emitenteNome?.trim() || item.partyNome || '';
        const partyCnpj = override?.emitenteCnpj?.trim() || item.partyCnpj || '';
        const faturaNumero = override?.faturaNumero?.trim() || item.faturaNumero;
        const dupNumero = override?.dupNumero?.trim() || item.dupNumero;
        const vencimento = override?.dupVencimento?.trim() || item.dupVencimento;
        const dupValor =
          override?.dupValor != null ? Number(override.dupValor) : item.dupValor;
        const statusInfo = getStatusFromVencimento(vencimento, todayEpochDay);

        const dup: Record<string, unknown> = {
          invoiceId: item.invoiceId,
          accessKey: item.accessKey,
          nfNumero: item.nfNumero,
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

        // Use direction-specific field names
        dup[config.partyFieldCnpj] = partyCnpj;
        dup[config.partyFieldNome] = partyNome;

        return { dup, vencimento, dupNumero, partyNome, partyCnpj };
      })
      .sort((a, b) => {
        const dayA = toEpochDay(a.vencimento);
        const dayB = toEpochDay(b.vencimento);
        if (Number.isFinite(dayA) && Number.isFinite(dayB) && dayA !== dayB) {
          return dayA - dayB;
        }
        return a.dupNumero.localeCompare(b.dupNumero);
      });

    // Build header party info
    const inv = invoice as Record<string, unknown>;
    let headerPartyNome: string;
    let headerPartyCnpj: string;

    if (direction === 'pagar') {
      const fallbackNome =
        inv.direction === 'issued'
          ? ((inv.recipientName as string) || '')
          : ((inv.senderName as string) || '');
      const fallbackCnpj =
        inv.direction === 'issued'
          ? ((inv.recipientCnpj as string) || '')
          : ((inv.senderCnpj as string) || '');
      headerPartyNome = duplicatas[0]?.partyNome || fallbackNome;
      headerPartyCnpj = duplicatas[0]?.partyCnpj || fallbackCnpj;
    } else {
      headerPartyNome =
        duplicatas[0]?.partyNome || (inv.recipientName as string) || '';
      headerPartyCnpj =
        duplicatas[0]?.partyCnpj || (inv.recipientCnpj as string) || '';
    }

    const invoiceResponse: Record<string, unknown> = {
      id: invoice.id,
      number: invoice.number,
      issueDate: invoice.issueDate,
      totalValue: Number(invoice.totalValue),
    };
    invoiceResponse[config.partyFieldNome] = headerPartyNome;
    invoiceResponse[config.partyFieldCnpj] = headerPartyCnpj;

    return NextResponse.json({
      invoice: invoiceResponse,
      duplicatas: duplicatas.map((d) => d.dup),
    });
  } catch (error) {
    const config = DIRECTION_CONFIG[direction];
    log.error({ err: error, label: config.errorLabelInvoice }, 'Error fetching invoice financeiro');
    return NextResponse.json({ error: 'Erro ao buscar detalhes da nota' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// handleInstallmentsPut - save installments
// ---------------------------------------------------------------------------

export async function handleInstallmentsPut(
  invoiceId: string,
  company: Company,
  body: { installments?: InstallmentInput[] }
): Promise<NextResponse> {
  try {
    const id = String(invoiceId || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'invoiceId e obrigatorio.' }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        companyId: company.id,
      },
      select: {
        id: true,
        totalValue: true,
      },
    });
    if (!invoice) {
      return NextResponse.json(
        { error: 'Nota nao encontrada para a empresa.' },
        { status: 404 }
      );
    }

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
        throw new Error(`Vencimento invalido na parcela ${dupNumero}.`);
      }

      const parsedValor = parseMoney(item?.dupValor);
      if (!Number.isFinite(parsedValor) || parsedValor < 0) {
        throw new Error(`Valor invalido na parcela ${dupNumero}.`);
      }
      const parsedDesconto = parseMoney(item?.dupDesconto ?? 0);
      if (!Number.isFinite(parsedDesconto) || parsedDesconto < 0) {
        throw new Error(`Desconto invalido na parcela ${dupNumero}.`);
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
        (sum: number, item: { dupValor: number; dupDesconto: number }) =>
          sum + getNetInstallmentValue(item.dupValor, item.dupDesconto),
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
        data: installments.map(
          (item: {
            dupNumero: string;
            dupVencimento: string;
            dupValor: number;
            dupDesconto: number;
          }) => ({
            companyId: company.id,
            invoiceId: invoice.id,
            dupNumero: item.dupNumero,
            dupVencimento: item.dupVencimento,
            dupValor: item.dupValor,
            dupDesconto: item.dupDesconto,
          })
        ),
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
      const validationErrorRegex =
        /(parcela|vencimento|valor|desconto|soma|invoiceId|obrigat|informe)/i;
      if (validationErrorRegex.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      log.error({ err: error }, 'Error saving invoice installments');
      return NextResponse.json({ error: 'Erro ao salvar parcelas.' }, { status: 500 });
    }
    log.error({ err: error }, 'Unknown error saving invoice installments');
    return NextResponse.json({ error: 'Erro ao salvar parcelas.' }, { status: 500 });
  }
}
