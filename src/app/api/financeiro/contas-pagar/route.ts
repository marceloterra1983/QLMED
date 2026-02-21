import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { parseXmlSafe } from '@/lib/safe-xml-parser';

function val(obj: any, ...keys: string[]): string {
  for (const k of keys) {
    if (obj?.[k] != null) return String(obj[k]);
  }
  return '';
}

function num(obj: any, key: string): number {
  const v = obj?.[key];
  if (v == null || v === '') return 0;
  return parseFloat(String(v).replace(',', '.')) || 0;
}

const BATCH_SIZE = 100;

async function extractDuplicatas(
  invoiceBatch: Array<{ id: string; xmlContent: string; accessKey: string; number: string; senderCnpj: string; senderName: string; issueDate: Date; totalValue: number }>,
  today: Date
) {
  const results: any[] = [];

  await Promise.all(
    invoiceBatch.map(async (invoice) => {
      try {
        const result = await parseXmlSafe(invoice.xmlContent);
        const nfeProc = result.nfeProc;
        const nfe = nfeProc ? nfeProc.NFe : result.NFe;
        const infNFe = nfe?.infNFe;
        if (!infNFe) return;

        const cobr = infNFe.cobr;
        if (!cobr) return;

        const fat = cobr.fat;
        const dupItems = cobr.dup;
        if (!dupItems) return;

        const dupList = Array.isArray(dupItems) ? dupItems : [dupItems];

        for (const dup of dupList) {
          const vencStr = val(dup, 'dVenc');
          const valor = num(dup, 'vDup');
          if (!vencStr || valor === 0) continue;

          const vencDate = new Date(vencStr + 'T00:00:00');
          const diffDays = Math.floor((vencDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

          let dupStatus: string;
          if (diffDays < 0) dupStatus = 'overdue';
          else if (diffDays === 0) dupStatus = 'due_today';
          else if (diffDays <= 7) dupStatus = 'due_soon';
          else dupStatus = 'upcoming';

          results.push({
            invoiceId: invoice.id,
            accessKey: invoice.accessKey,
            nfNumero: invoice.number,
            emitenteCnpj: invoice.senderCnpj,
            emitenteNome: invoice.senderName,
            nfEmissao: invoice.issueDate,
            nfValorTotal: invoice.totalValue,
            faturaNumero: fat ? val(fat, 'nFat') : '',
            faturaValorOriginal: fat ? num(fat, 'vOrig') : 0,
            faturaValorLiquido: fat ? num(fat, 'vLiq') : 0,
            dupNumero: val(dup, 'nDup'),
            dupVencimento: vencStr,
            dupValor: valor,
            status: dupStatus,
            diasAtraso: diffDays < 0 ? Math.abs(diffDays) : 0,
            diasParaVencer: diffDays > 0 ? diffDays : 0,
          });
        }
      } catch {
        // Skip invoices with unparseable XML
      }
    })
  );

  return results;
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
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const search = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const sortBy = searchParams.get('sort') || 'vencimento';
    const sortOrder = searchParams.get('order') || 'asc';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // First: get invoice IDs without xmlContent (fast, lightweight)
    const invoiceIds = await prisma.invoice.findMany({
      where: {
        companyId: company.id,
        type: 'NFE',
        direction: 'received',
      },
      select: { id: true },
      orderBy: { issueDate: 'desc' },
    });

    // Process in batches - only load xmlContent for each batch
    const allDuplicatas: any[] = [];
    const idChunks: string[][] = [];
    for (let i = 0; i < invoiceIds.length; i += BATCH_SIZE) {
      idChunks.push(invoiceIds.slice(i, i + BATCH_SIZE).map((inv) => inv.id));
    }

    for (const chunk of idChunks) {
      const batch = await prisma.invoice.findMany({
        where: { id: { in: chunk } },
        select: {
          id: true,
          accessKey: true,
          number: true,
          senderCnpj: true,
          senderName: true,
          issueDate: true,
          totalValue: true,
          xmlContent: true,
        },
      });

      const batchResults = await extractDuplicatas(batch, today);
      allDuplicatas.push(...batchResults);
    }

    // Apply filters
    let filtered = allDuplicatas;

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(d =>
        d.emitenteNome.toLowerCase().includes(s) ||
        d.emitenteCnpj.includes(s) ||
        d.nfNumero.includes(s) ||
        d.dupNumero.toLowerCase().includes(s)
      );
    }

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'overdue') {
        filtered = filtered.filter(d => d.status === 'overdue');
      } else if (statusFilter === 'due_today') {
        filtered = filtered.filter(d => d.status === 'due_today');
      } else if (statusFilter === 'due_soon') {
        filtered = filtered.filter(d => d.status === 'due_soon' || d.status === 'due_today');
      } else if (statusFilter === 'upcoming') {
        filtered = filtered.filter(d => d.status === 'upcoming' || d.status === 'due_soon');
      }
    }

    if (dateFrom) {
      const from = new Date(dateFrom + 'T00:00:00');
      filtered = filtered.filter(d => new Date(d.dupVencimento + 'T00:00:00') >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo + 'T00:00:00');
      filtered = filtered.filter(d => new Date(d.dupVencimento + 'T00:00:00') <= to);
    }

    // Sort
    const sortFn = (a: any, b: any) => {
      let cmp = 0;
      switch (sortBy) {
        case 'vencimento':
          cmp = a.dupVencimento.localeCompare(b.dupVencimento);
          break;
        case 'valor':
          cmp = a.dupValor - b.dupValor;
          break;
        case 'emitente':
          cmp = a.emitenteNome.localeCompare(b.emitenteNome);
          break;
        case 'nfNumero':
          cmp = parseInt(a.nfNumero) - parseInt(b.nfNumero);
          break;
        case 'status':
          const statusOrder: Record<string, number> = { overdue: 0, due_today: 1, due_soon: 2, upcoming: 3 };
          cmp = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
          break;
        default:
          cmp = a.dupVencimento.localeCompare(b.dupVencimento);
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    };

    filtered.sort(sortFn);

    // Summary
    const summary = {
      total: filtered.length,
      totalValor: filtered.reduce((acc, d) => acc + d.dupValor, 0),
      vencidas: filtered.filter(d => d.status === 'overdue').length,
      vencidasValor: filtered.filter(d => d.status === 'overdue').reduce((acc, d) => acc + d.dupValor, 0),
      venceHoje: filtered.filter(d => d.status === 'due_today').length,
      venceHojeValor: filtered.filter(d => d.status === 'due_today').reduce((acc, d) => acc + d.dupValor, 0),
      aVencer: filtered.filter(d => d.status === 'upcoming' || d.status === 'due_soon').length,
      aVencerValor: filtered.filter(d => d.status === 'upcoming' || d.status === 'due_soon').reduce((acc, d) => acc + d.dupValor, 0),
    };

    // Paginate
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
