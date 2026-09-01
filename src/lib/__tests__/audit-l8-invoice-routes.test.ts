/**
 * Auditoria b177b07, folha L8 — contratos das rotas de nota.
 *
 * QLMED-DATA-007: o `remaining` do backfill de imposto só olhava
 * invoice_tax_totals. Nota com totais gravados e nenhuma linha em
 * invoice_item_tax passava por "processada", e a rota respondia
 * "Done! All invoices processed" com a cobertura de itens incompleta.
 *
 * QLMED-DATA-011: `GET /api/invoices/[id]` devolvia a linha inteira — o XML
 * fiscal completo em cada abertura do modal de detalhes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireEditor: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  invoiceFindFirst: vi.fn(),
  invoiceFindMany: vi.fn(),
  invoiceCount: vi.fn(),
  taxTotalsFindMany: vi.fn(),
  taxTotalsCount: vi.fn(),
  itemTaxFindMany: vi.fn(),
  productRegistryFindMany: vi.fn(),
  productRegistryUpdate: vi.fn(),
  extractAllTaxData: vi.fn(),
  upsertTaxTotals: vi.fn(),
  upsertItemTaxes: vi.fn(),
  markCompanyForSyncRecovery: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireAuth: mocks.requireAuth,
    requireEditor: mocks.requireEditor,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});

vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: {
      findFirst: mocks.invoiceFindFirst,
      findMany: mocks.invoiceFindMany,
      count: mocks.invoiceCount,
    },
    invoiceTaxTotals: { findMany: mocks.taxTotalsFindMany, count: mocks.taxTotalsCount },
    invoiceItemTax: { findMany: mocks.itemTaxFindMany },
    productRegistry: {
      findMany: mocks.productRegistryFindMany,
      update: mocks.productRegistryUpdate,
    },
  },
}));

vi.mock('@/lib/parse-invoice-tax', () => ({ extractAllTaxData: mocks.extractAllTaxData }));

vi.mock('@/lib/invoice-tax-store', () => ({
  upsertTaxTotals: mocks.upsertTaxTotals,
  upsertItemTaxes: mocks.upsertItemTaxes,
}));

vi.mock('@/lib/sync-recovery', () => ({
  markCompanyForSyncRecovery: mocks.markCompanyForSyncRecovery,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { GET } from '@/app/api/invoices/[id]/route';
import { POST as backfillTax } from '@/app/api/invoices/backfill-tax/route';

/** A rota tipa NextRequest, mas só lê o método. Request basta no teste. */
function backfillRequest(): Parameters<typeof backfillTax>[0] {
  return new Request('http://localhost/api/invoices/backfill-tax', {
    method: 'POST',
  }) as Parameters<typeof backfillTax>[0];
}

const COMPANY = { id: 'company-1', cnpj: '12345678000199' };

// ---------------------------------------------------------------------------
// QLMED-DATA-011
// ---------------------------------------------------------------------------

describe('QLMED-DATA-011 — GET /api/invoices/:id não serializa o XML fiscal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.getOrCreateSingleCompany.mockResolvedValue(COMPANY);
  });

  it('pede um select explícito e xmlContent não está nele', async () => {
    mocks.invoiceFindFirst.mockResolvedValue({ id: 'inv-1', accessKey: 'K', number: '1' });

    await GET(new Request('http://localhost/api/invoices/inv-1'), {
      params: Promise.resolve({ id: 'inv-1' }),
    });

    const args = mocks.invoiceFindFirst.mock.calls[0][0];
    expect(args.select).toBeDefined();
    // `include` traria a linha inteira de volta pela porta dos fundos.
    expect(args.include).toBeUndefined();
    expect(args.select.xmlContent).toBeUndefined();
    expect(args.select.accessKey).toBe(true);
    expect(args.select.company).toEqual({ select: { razaoSocial: true, cnpj: true } });
  });

  it('a resposta não carrega xmlContent nem que o banco o devolva', async () => {
    // Mesmo que a camada de dados escorregue e traga o campo, a asserção é sobre
    // o que sai na resposta — é isso que chega ao browser.
    mocks.invoiceFindFirst.mockResolvedValue({
      id: 'inv-1',
      accessKey: 'K',
      number: '1',
      type: 'NFE',
    });

    const res = await GET(new Request('http://localhost/api/invoices/inv-1'), {
      params: Promise.resolve({ id: 'inv-1' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).not.toHaveProperty('xmlContent');
    // O modal de detalhes usa exatamente estes três campos; o XML ele busca em
    // /api/invoices/:id/download.
    expect(body.accessKey).toBe('K');
    expect(body.number).toBe('1');
    expect(body.type).toBe('NFE');
  });
});

// ---------------------------------------------------------------------------
// QLMED-DATA-007 · REAUD-DATA-014 · REAUD-TEST-001
// ---------------------------------------------------------------------------

/**
 * `prisma.invoice.findMany` é chamado em três pontos diferentes da rota de
 * backfill. Roteia pela forma dos argumentos em vez de por ordem de chamada,
 * que é frágil.
 */
function routeInvoiceFindMany(nfeIds: string[], xmlById: Record<string, string | null>) {
  return async (args: {
    where?: { id?: { in?: string[] }; type?: string };
    select?: Record<string, unknown>;
  }) => {
    if (args.where?.id?.in) {
      return args.where.id.in.map((id) =>
        args.select?.xmlContent
          ? { id, xmlContent: xmlById[id] ?? null, companyId: COMPANY.id }
          : { id, issueDate: new Date('2026-08-01T00:00:00.000Z') },
      );
    }
    return nfeIds.map((id) => ({ id }));
  };
}

/** O filtro `itemCount` que a rota passa ao Prisma, aplicado a uma linha. */
function matchesItemCount(value: number | null, filter: unknown): boolean {
  if (filter === undefined) return true;
  if (typeof filter === 'number') return value === filter;
  if (filter && typeof filter === 'object' && 'not' in filter) {
    return value !== (filter as { not: unknown }).not;
  }
  throw new Error(`filtro itemCount sem suporte no store: ${JSON.stringify(filter)}`);
}

/**
 * REAUD-TEST-001: a versão anterior deste bloco mockava `taxTotalsCount` com o
 * número que o teste queria e `extractAllTaxData` nunca rejeitava, portanto
 * `remaining` era aritmética sobre mocks, não consequência da escrita.
 *
 * Aqui invoice_tax_totals é um Map (invoiceId → item_count): o que
 * `upsertTaxTotals` grava é o que `findMany`/`count` lêem, com o filtro
 * `itemCount` que a rota passa. `remaining` passa a ser medido.
 */
function memoryTaxTotals(
  nfeIds: string[],
  xmlById: Record<string, string | null>,
  seed: Record<string, number | null> = {},
) {
  const rows = new Map<string, number | null>(Object.entries(seed));
  mocks.invoiceFindMany.mockImplementation(routeInvoiceFindMany(nfeIds, xmlById));
  mocks.invoiceCount.mockResolvedValue(nfeIds.length);
  mocks.upsertTaxTotals.mockImplementation(
    async (data: { invoiceId: string; itemCount: number }) => {
      rows.set(data.invoiceId, data.itemCount);
    },
  );
  mocks.taxTotalsFindMany.mockImplementation(
    async (args: { where: { invoiceId: { in: string[] }; itemCount?: unknown } }) =>
      [...rows]
        .filter(
          ([id, value]) =>
            args.where.invoiceId.in.includes(id) && matchesItemCount(value, args.where.itemCount),
        )
        .map(([invoiceId]) => ({ invoiceId })),
  );
  mocks.taxTotalsCount.mockImplementation(
    async (args: { where: { itemCount?: unknown } }) =>
      [...rows.values()].filter((value) => matchesItemCount(value, args.where.itemCount)).length,
  );
  return rows;
}

async function callBackfill() {
  const res = await backfillTax(backfillRequest());
  return res.json();
}

describe('QLMED-DATA-007 — o remaining do backfill considera cobertura de itens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.getOrCreateSingleCompany.mockResolvedValue(COMPANY);
    mocks.itemTaxFindMany.mockResolvedValue([]);
    mocks.productRegistryFindMany.mockResolvedValue([]);
    mocks.extractAllTaxData.mockResolvedValue({ totals: { vbc: 1 }, items: [{ itemNumber: 1 }] });
    mocks.upsertItemTaxes.mockResolvedValue(undefined);
  });

  it('linha antiga com item_count NULL volta ao lote exatamente uma vez', async () => {
    // 3 NF-e. inv-1 já medida; inv-2 e inv-3 têm linha de totais com
    // item_count NULL — o defeito antigo as dava por prontas.
    const rows = memoryTaxTotals(
      ['inv-1', 'inv-2', 'inv-3'],
      { 'inv-2': '<xml/>', 'inv-3': '<xml/>' },
      { 'inv-1': 1, 'inv-2': null, 'inv-3': null },
    );

    const first = await callBackfill();

    // O filtro de seleção é por cobertura medida, não por "tem linha de totais".
    expect(mocks.taxTotalsFindMany.mock.calls[0][0].where.itemCount).toEqual({ not: null });
    expect(first.processed).toBe(2);
    expect(rows.get('inv-2')).toBe(1);
    expect(rows.get('inv-3')).toBe(1);
    expect(first.remaining).toBe(0);

    const second = await callBackfill();
    expect(second.processed).toBe(0);
    expect(second.remaining).toBe(0);
    expect(second.message).toBe('All invoices already have tax data');
  });

  it('lote cheio: a 1ª chamada deixa remaining medido e pede continuação; a 2ª fecha', async () => {
    // BATCH_SIZE é 200. Com 201 NF-e a primeira chamada tem de deixar 1 e
    // dizê-lo; a segunda apanha a que sobrou.
    const ids = Array.from({ length: 201 }, (_, i) => `inv-${i}`);
    memoryTaxTotals(ids, Object.fromEntries(ids.map((id) => [id, '<xml/>'])));

    const first = await callBackfill();
    expect(first.processed).toBe(200);
    expect(first.remaining).toBe(1);
    expect(first.message).toContain('remaining');

    const second = await callBackfill();
    expect(second.processed).toBe(1);
    expect(second.remaining).toBe(0);
  });

  it('grava item_count em toda nota processada, para o laço do dashboard terminar', async () => {
    const rows = memoryTaxTotals(['inv-1'], { 'inv-1': '<xml/>' });
    mocks.extractAllTaxData.mockResolvedValue({
      totals: { vbc: 10 },
      items: [{ itemNumber: 1 }, { itemNumber: 2 }],
    });

    const body = await callBackfill();

    expect(mocks.upsertTaxTotals).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv-1', itemCount: 2 }),
    );
    expect(rows.get('inv-1')).toBe(2);
    expect(body.remaining).toBe(0);
  });

  it('XML sem item nenhum é medido como item_count 0 e sai de remaining', async () => {
    // É o caso que faria `while (remaining > 0)` girar para sempre se remaining
    // fosse "notas sem linha em invoice_item_tax".
    const rows = memoryTaxTotals(['inv-1'], { 'inv-1': '<xml/>' });
    mocks.extractAllTaxData.mockResolvedValue({ totals: null, items: [] });

    const first = await callBackfill();

    // Totais gravados mesmo sem ICMSTot: é a marca de "o backfill olhou".
    expect(mocks.upsertTaxTotals).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv-1', itemCount: 0, vbc: null }),
    );
    // E os itens são reescritos mesmo com lista vazia, o que limpa linhas
    // obsoletas de uma passagem anterior.
    expect(mocks.upsertItemTaxes).toHaveBeenCalledWith('inv-1', COMPANY.id, []);
    expect(rows.get('inv-1')).toBe(0);
    expect(first.remaining).toBe(0);
    // A cobertura incompleta aparece na resposta em vez de sumir no "Done!".
    expect(first.withoutItems).toBe(1);
    expect(first.message).toContain('without extractable items');

    const second = await callBackfill();
    expect(second.processed).toBe(0);
    expect(second.remaining).toBe(0);
  });

  // REAUD-DATA-014: os dois caminhos em que a rota antiga não gravava nada e
  // a nota voltava a todos os lotes seguintes — `remaining` medido em oito
  // chamadas seguidas dava [1,1,1,1,1,1,1,1].

  it('REAUD-DATA-014: XML que não parseia ganha item_count -1 e não volta ao lote', async () => {
    const rows = memoryTaxTotals(['inv-1'], { 'inv-1': '<nfeProc><!-- truncado' });
    mocks.extractAllTaxData.mockRejectedValue(new Error('XML truncado'));

    const first = await callBackfill();

    expect(mocks.extractAllTaxData).toHaveBeenCalledTimes(1);
    expect(first.processed).toBe(0);
    expect(first.errors).toBe(1);
    // A marca de "olhei e não consegui" é gravada fora do try que parseia.
    expect(rows.get('inv-1')).toBe(-1);
    expect(mocks.upsertItemTaxes).toHaveBeenCalledWith('inv-1', COMPANY.id, []);
    expect(first.remaining).toBe(0);

    const second = await callBackfill();
    // Não foi reselecionada: nem parse nem escrita de novo.
    expect(mocks.extractAllTaxData).toHaveBeenCalledTimes(1);
    expect(mocks.upsertTaxTotals).toHaveBeenCalledTimes(1);
    expect(second.processed).toBe(0);
    expect(second.errors).toBe(0);
    expect(second.remaining).toBe(0);
  });

  it('REAUD-DATA-014: xmlContent vazio ganha item_count -1 e conta como erro, não como processada', async () => {
    const rows = memoryTaxTotals(['inv-1'], { 'inv-1': null });

    const first = await callBackfill();

    expect(mocks.extractAllTaxData).not.toHaveBeenCalled();
    expect(first.processed).toBe(0);
    expect(first.errors).toBe(1);
    expect(rows.get('inv-1')).toBe(-1);
    expect(first.remaining).toBe(0);

    const second = await callBackfill();
    expect(mocks.upsertTaxTotals).toHaveBeenCalledTimes(1);
    expect(second.processed).toBe(0);
    expect(second.remaining).toBe(0);
  });
});
