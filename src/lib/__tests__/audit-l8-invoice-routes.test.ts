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
// QLMED-DATA-007
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

describe('QLMED-DATA-007 — o remaining do backfill considera cobertura de itens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.getOrCreateSingleCompany.mockResolvedValue(COMPANY);
    mocks.itemTaxFindMany.mockResolvedValue([]);
    mocks.productRegistryFindMany.mockResolvedValue([]);
    mocks.extractAllTaxData.mockResolvedValue({ totals: { vbc: 1 }, items: [{ itemNumber: 1 }] });
    mocks.upsertTaxTotals.mockResolvedValue(undefined);
    mocks.upsertItemTaxes.mockResolvedValue(undefined);
  });

  it('nota com totais e sem itens medidos volta ao lote e conta em remaining', async () => {
    // 3 NF-e. Uma já foi medida (item_count preenchido); as outras duas têm
    // linha de totais mas item_count NULL — o defeito antigo as dava por prontas.
    mocks.invoiceFindMany.mockImplementation(
      routeInvoiceFindMany(['inv-1', 'inv-2', 'inv-3'], {
        'inv-2': '<xml/>',
        'inv-3': '<xml/>',
      }),
    );
    mocks.taxTotalsFindMany.mockResolvedValue([{ invoiceId: 'inv-1' }]);
    mocks.invoiceCount.mockResolvedValue(3);
    // Depois desta passagem só inv-1 continua medida no mock de contagem.
    mocks.taxTotalsCount.mockImplementation(async (args: { where?: { itemCount?: unknown } }) =>
      JSON.stringify(args.where?.itemCount) === '{"not":null}' ? 1 : 0,
    );

    const res = await backfillTax(backfillRequest());
    const body = await res.json();

    // O filtro de seleção é por cobertura medida, não por "tem linha de totais".
    expect(mocks.taxTotalsFindMany.mock.calls[0][0].where.itemCount).toEqual({ not: null });
    expect(body.processed).toBe(2);
    expect(body.remaining).toBe(2);
    expect(body.message).toContain('remaining');
  });

  it('grava item_count em toda nota processada, para o laço do dashboard terminar', async () => {
    mocks.invoiceFindMany.mockImplementation(
      routeInvoiceFindMany(['inv-1'], { 'inv-1': '<xml/>' }),
    );
    mocks.taxTotalsFindMany.mockResolvedValue([]);
    mocks.invoiceCount.mockResolvedValue(1);
    mocks.taxTotalsCount.mockResolvedValue(1);
    mocks.extractAllTaxData.mockResolvedValue({
      totals: { vbc: 10 },
      items: [{ itemNumber: 1 }, { itemNumber: 2 }],
    });

    const res = await backfillTax(backfillRequest());
    const body = await res.json();

    expect(mocks.upsertTaxTotals).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv-1', itemCount: 2 }),
    );
    expect(body.remaining).toBe(0);
  });

  it('XML sem item nenhum é medido como item_count 0 e sai de remaining', async () => {
    // É o caso que faria `while (remaining > 0)` girar para sempre se remaining
    // fosse "notas sem linha em invoice_item_tax".
    mocks.invoiceFindMany.mockImplementation(
      routeInvoiceFindMany(['inv-1'], { 'inv-1': '<xml/>' }),
    );
    mocks.taxTotalsFindMany.mockResolvedValue([]);
    mocks.invoiceCount.mockResolvedValue(1);
    mocks.taxTotalsCount.mockImplementation(async (args: { where?: { itemCount?: unknown } }) =>
      JSON.stringify(args.where?.itemCount) === '{"not":null}' ? 1 : 1,
    );
    mocks.extractAllTaxData.mockResolvedValue({ totals: null, items: [] });

    const res = await backfillTax(backfillRequest());
    const body = await res.json();

    // Totais gravados mesmo sem ICMSTot: é a marca de "o backfill olhou".
    expect(mocks.upsertTaxTotals).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv-1', itemCount: 0, vbc: null }),
    );
    // E os itens são reescritos mesmo com lista vazia, o que limpa linhas
    // obsoletas de uma passagem anterior.
    expect(mocks.upsertItemTaxes).toHaveBeenCalledWith('inv-1', COMPANY.id, []);
    expect(body.remaining).toBe(0);
    // A cobertura incompleta aparece na resposta em vez de sumir no "Done!".
    expect(body.withoutItems).toBe(1);
    expect(body.message).toContain('without extractable items');
  });
});
