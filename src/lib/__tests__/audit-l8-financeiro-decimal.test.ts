/**
 * Auditoria b177b07, QLMED-DATA-005 — dinheiro em Float no caminho de leitura.
 *
 * Duas metades do mesmo defeito, e o teste percorre as duas de ponta a ponta:
 * linha de `invoice_duplicata` → `getFinanceiroDuplicatas` → resumo do GET.
 *
 * 1. `invoice_duplicata` guarda cada valor duas vezes: a coluna `Float` legada e
 *    o sidecar `Decimal` que o dual-write da SPEC-004 escreve. A leitura lia só
 *    o `Float` — jogava fora a precisão que o write path pagou para ter, e
 *    ficava cega a qualquer divergência entre os dois.
 *
 * 2. O resumo do topo da tela somava as parcelas com `+=` em `number`. Em
 *    IEEE-754 isso acumula erro parcela a parcela: o total deixa de bater com a
 *    soma das linhas logo abaixo dele.
 *
 * Os valores são escolhidos para quebrar em binário — o próprio teste mede o
 * controle antes de afirmar qualquer coisa. Se a soma fechasse em `number`, o
 * teste não provaria nada.
 */
import { Decimal } from '@prisma/client-runtime-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoiceFindMany: vi.fn(),
  invoiceAggregate: vi.fn(),
  invoiceCount: vi.fn(),
  duplicataFindMany: vi.fn(),
  duplicataGroupBy: vi.fn(),
  manualFindMany: vi.fn(),
  overrideFindMany: vi.fn(),
  nicknameFindMany: vi.fn(),
  backfill: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: {
      findMany: mocks.invoiceFindMany,
      aggregate: mocks.invoiceAggregate,
      count: mocks.invoiceCount,
    },
    invoiceDuplicata: {
      findMany: mocks.duplicataFindMany,
      groupBy: mocks.duplicataGroupBy,
    },
    financeiroDuplicataManualInstallment: { findMany: mocks.manualFindMany },
    financeiroDuplicataOverride: { findMany: mocks.overrideFindMany },
    contactNickname: { findMany: mocks.nicknameFindMany },
  },
}));

vi.mock('@/lib/invoice-duplicata-store', () => ({
  backfillInvoiceDuplicatas: mocks.backfill,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

/**
 * Parcelas de centavo cuja soma em `number` NÃO fecha: 61.199999999999996.
 * A soma exata é 61.20.
 */
const PARCELAS = ['10.10', '20.20', '30.30', '0.10', '0.20', '0.30'];
const TOTAL_EXATO = 61.2;

/** Vencimento fixo e distante: não depende da data em que a suíte roda. */
const VENCIMENTO = '2099-12-31';

function invoiceRow(index: number) {
  return {
    id: `inv-${index}`,
    accessKey: `chave-${index}`,
    number: String(index),
    senderCnpj: '11111111000111',
    senderName: 'Fornecedor',
    recipientCnpj: '22222222000122',
    recipientName: 'QLMED',
    issueDate: new Date('2026-08-01T00:00:00.000Z'),
    totalValue: new Decimal('61.20'),
    cfop: '1102',
  };
}

/**
 * Linha de invoice_duplicata com o sidecar Decimal preenchido. `dupValor`
 * (Float) recebe de propósito um valor DIFERENTE: é assim que o teste distingue
 * qual das duas colunas a leitura usou.
 */
function duplicataRow(index: number, decimalValue: string, floatDivergente: number) {
  return {
    invoiceId: `inv-${index}`,
    dupNumero: String(index).padStart(3, '0'),
    dupVencimento: VENCIMENTO,
    dupValor: floatDivergente,
    dupValorDecimal: new Decimal(decimalValue),
    faturaNumero: '',
    faturaValorOriginal: floatDivergente,
    faturaValorOriginalDecimal: new Decimal(decimalValue),
    faturaValorLiquido: floatDivergente,
    faturaValorLiquidoDecimal: new Decimal(decimalValue),
  };
}

/**
 * `getFinanceiroDuplicatas` guarda cache de módulo com chave de versão. Cada
 * teste recarrega os módulos para partir de estado limpo, senão o segundo teste
 * lê o resultado do primeiro.
 */
async function freshModules() {
  vi.resetModules();
  // O cache de `financeiro-duplicatas` vive em globalThis fora de producao, e
  // portanto sobrevive a resetModules(). Sem apagar aqui, o segundo teste le o
  // resultado do primeiro.
  delete (globalThis as Record<string, unknown>).financeiroDuplicatasCache;
  delete (globalThis as Record<string, unknown>).financeiroDuplicatasInFlight;
  return {
    financeiro: await import('@/lib/financeiro-duplicatas'),
    shared: await import('@/lib/financeiro-shared'),
  };
}

function stubBase(rowCount: number) {
  mocks.invoiceAggregate.mockResolvedValue({
    _count: { _all: rowCount },
    _max: { createdAt: new Date('2026-09-01T00:00:00.000Z') },
    _sum: { totalValue: new Decimal('61.20') },
  });
  mocks.invoiceCount.mockResolvedValue(rowCount);
  mocks.duplicataGroupBy.mockResolvedValue(
    Array.from({ length: rowCount }, (_, i) => ({ invoiceId: `inv-${i}`, _count: 1 })),
  );
  mocks.invoiceFindMany.mockResolvedValue(
    Array.from({ length: rowCount }, (_, i) => invoiceRow(i)),
  );
  mocks.manualFindMany.mockResolvedValue([]);
  mocks.overrideFindMany.mockResolvedValue([]);
  mocks.nicknameFindMany.mockResolvedValue([]);
}

describe('QLMED-DATA-005 — a leitura prefere o sidecar Decimal ao Float legado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usa o sidecar Decimal quando o Float legado divergiu', async () => {
    stubBase(1);
    // Divergência plantada: o Float diz 10.10, o Decimal diz 10.13. O sidecar é
    // a fonte da verdade — é ele que o write path arredonda em half-up.
    mocks.duplicataFindMany.mockResolvedValue([duplicataRow(0, '10.13', 10.1)]);

    const { financeiro } = await freshModules();
    const [dup] = await financeiro.getFinanceiroDuplicatas('company-1', 'received');

    expect(dup.dupValor).toBe(10.13);
    expect(dup.faturaValorOriginal).toBe(10.13);
    expect(dup.faturaValorLiquido).toBe(10.13);
  });

  it('cai no Float quando a linha é anterior ao dual-write e não tem sidecar', async () => {
    stubBase(1);
    mocks.duplicataFindMany.mockResolvedValue([
      {
        invoiceId: 'inv-0',
        dupNumero: '000',
        dupVencimento: VENCIMENTO,
        dupValor: 10.1,
        dupValorDecimal: null,
        faturaNumero: '',
        faturaValorOriginal: 20.2,
        faturaValorOriginalDecimal: null,
        faturaValorLiquido: null,
        faturaValorLiquidoDecimal: null,
      },
    ]);

    const { financeiro } = await freshModules();
    const [dup] = await financeiro.getFinanceiroDuplicatas('company-1', 'received');

    expect(dup.dupValor).toBe(10.1);
    expect(dup.faturaValorOriginal).toBe(20.2);
    expect(dup.faturaValorLiquido).toBe(0);
  });
});

describe('QLMED-DATA-005 — o resumo financeiro soma em aritmética de centavo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('o total do resumo bate exatamente com a soma das parcelas exibidas', async () => {
    // Controle medido, não afirmado: em `number` puro esta soma não dá 61.20.
    const somaEmFloat = PARCELAS.map(Number).reduce((a, b) => a + b, 0);
    expect(somaEmFloat).not.toBe(TOTAL_EXATO);
    expect(somaEmFloat).toBe(61.199999999999996);

    stubBase(PARCELAS.length);
    mocks.duplicataFindMany.mockResolvedValue(
      // Float legado zerado de propósito: se a leitura usar a coluna errada, o
      // total dá 0 e o teste aponta exatamente onde.
      PARCELAS.map((valor, i) => duplicataRow(i, valor, 0)),
    );

    const { shared } = await freshModules();
    // 'receber' de proposito: 'pagar' consulta duas direcoes e concatena, o que
    // duplicaria as linhas do mock sem provar nada sobre a soma.
    const res = await shared.handleContasGet(
      { id: 'company-1', cnpj: '12345678000199' },
      'receber',
      new URLSearchParams({ limit: '100' }),
    );
    const body = await res.json();

    expect(body.summary.total).toBe(PARCELAS.length);
    expect(body.summary.totalValor).toBe(TOTAL_EXATO);
    expect(body.summary.aVencerValor).toBe(TOTAL_EXATO);

    // E o total é de facto a soma exata das linhas devolvidas na mesma resposta.
    const somaDasLinhas = body.duplicatas.reduce(
      (acc: Decimal, d: { dupValor: number }) => acc.plus(d.dupValor),
      new Decimal(0),
    );
    expect(body.summary.totalValor).toBe(Number(somaDasLinhas.toFixed(2)));
  });
});
