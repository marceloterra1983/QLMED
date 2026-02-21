import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { getFinanceiroDuplicatas } from '@/lib/financeiro-duplicatas';
import { normalizeForSearch, flexMatch } from '@/lib/utils';

type DuplicataStatus = 'overdue' | 'due_today' | 'due_soon' | 'upcoming';
const VENCIMENTO_PRIORITY_ASC: Record<DuplicataStatus, number> = {
  due_today: 0,
  due_soon: 1,
  upcoming: 2,
  overdue: 3,
};

interface ContasPagarDuplicata {
  invoiceId: string;
  accessKey: string;
  nfNumero: string;
  emitenteCnpj: string;
  emitenteNome: string;
  nfEmissao: Date;
  nfValorTotal: number;
  faturaNumero: string;
  faturaValorOriginal: number;
  faturaValorLiquido: number;
  dupNumero: string;
  dupVencimento: string;
  dupValor: number;
  status: DuplicataStatus;
  diasAtraso: number;
  diasParaVencer: number;
  parcelaTotal: number;
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

function getParcelaGroupKey(duplicata: Pick<ContasPagarDuplicata, 'invoiceId' | 'faturaNumero' | 'nfNumero'>) {
  return `${duplicata.invoiceId}::${duplicata.faturaNumero || duplicata.nfNumero}`;
}

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
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

    const baseDuplicatas = await getFinanceiroDuplicatas(company.id, 'received');
    const normalizedSearch = normalizeForSearch(search.trim());

    const filtered: ContasPagarDuplicata[] = [];
    const summary = {
      total: 0,
      totalValor: 0,
      hoje: 0,
      hojeValor: 0,
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

    for (const item of baseDuplicatas) {
      const vencimento = item.dupVencimento;
      if (dateFrom && vencimento < dateFrom) continue;
      if (dateTo && vencimento > dateTo) continue;

      const statusInfo = getStatusFromVencimento(vencimento, todayEpochDay);
      if (!matchesStatusFilter(statusInfo.status, statusFilter)) continue;

      const emitenteNome = item.partyNome || '';
      const emitenteCnpj = item.partyCnpj || '';
      if (
        normalizedSearch &&
        !flexMatch(emitenteNome, normalizedSearch) &&
        !emitenteCnpj.includes(normalizedSearch) &&
        !item.nfNumero.includes(normalizedSearch) &&
        !flexMatch(item.dupNumero, normalizedSearch)
      ) {
        continue;
      }

      const duplicata: ContasPagarDuplicata = {
        invoiceId: item.invoiceId,
        accessKey: item.accessKey,
        nfNumero: item.nfNumero,
        emitenteCnpj,
        emitenteNome,
        nfEmissao: item.nfEmissao,
        nfValorTotal: item.nfValorTotal,
        faturaNumero: item.faturaNumero,
        faturaValorOriginal: item.faturaValorOriginal,
        faturaValorLiquido: item.faturaValorLiquido,
        dupNumero: item.dupNumero,
        dupVencimento: item.dupVencimento,
        dupValor: item.dupValor,
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

    const parcelaTotalByGroup = new Map<string, number>();
    for (const duplicata of filtered) {
      const key = getParcelaGroupKey(duplicata);
      parcelaTotalByGroup.set(key, (parcelaTotalByGroup.get(key) || 0) + 1);
    }
    for (const duplicata of filtered) {
      const key = getParcelaGroupKey(duplicata);
      duplicata.parcelaTotal = parcelaTotalByGroup.get(key) || 1;
    }

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'vencimento': {
          const dayA = toEpochDay(a.dupVencimento);
          const dayB = toEpochDay(b.dupVencimento);
          const dayCmp = Number.isFinite(dayA) && Number.isFinite(dayB)
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
          cmp = a.emitenteNome.localeCompare(b.emitenteNome);
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

    return NextResponse.json({
      duplicatas: paginated,
      summary,
      pagination: { page, limit, total, pages },
    });
  } catch (error) {
    console.error('Error fetching contas a pagar:', error);
    return NextResponse.json({ error: 'Erro ao buscar contas a pagar' }, { status: 500 });
  }
}
