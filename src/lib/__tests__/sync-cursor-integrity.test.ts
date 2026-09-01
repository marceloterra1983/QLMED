import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptPfx } from '@/lib/certificate-secret';

process.env.ENCRYPTION_KEY = 'test-encryption-key-for-vitest-32chars!';

/** O CNPJ é o AAD da cifra: tem de ser o mesmo que a estratégia passa. */
const COMPANY_CNPJ = '22222222000191';

// FISCAL-007: o cursor (NSU) não pode passar por cima de documento que não foi
// gravado. Documento pulado com cursor à frente é documento fiscal perdido em
// silêncio — e a corrida ainda reportava 'completed'.

const mocks = vi.hoisted(() => {
  // Espaçamento entre consultas: 1ms nos testes (o default de 2000ms é lido no
  // topo do módulo). `|| 2000` trata '0' como ausente, por isso usa-se '1'.
  process.env.SEFAZ_QUERY_DELAY_MS = '1';
  process.env.RECEITA_NFSE_QUERY_DELAY_MS = '1';
  return {
    buscarNovosDocumentos: vi.fn(),
    fetchDfeByNsu: vi.fn(),
    certUpdate: vi.fn(),
    receitaConfigUpdate: vi.fn(),
    syncLogUpdate: vi.fn(),
    upsert: vi.fn(),
    parseInvoiceXml: vi.fn(),
    applyNfeCancellationOutcome: vi.fn(),
    skipUpsert: vi.fn(),
    invoiceUpdateMany: vi.fn(),
    invoiceCount: vi.fn(),
    release: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => {
  const client = {
    certificateConfig: { update: mocks.certUpdate },
    receitaNfseConfig: { update: mocks.receitaConfigUpdate },
    syncLog: { update: mocks.syncLogUpdate },
    syncSkippedDocument: { upsert: mocks.skipUpsert },
    invoice: { updateMany: mocks.invoiceUpdateMany, count: mocks.invoiceCount },
  };
  return { prisma: client, default: client };
});

vi.mock('@/lib/postgres-advisory-lock', () => ({
  beginSyncRun: vi.fn(async () => ({ syncLogId: 'sync-log-1', release: mocks.release })),
}));

// Só o `decrypt` da senha é substituído: `encryptPfx` da fixture usa o
// `deriveKey` real, e mockar o módulo inteiro tirava a cifra do caminho.
vi.mock('@/lib/crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/crypto')>()),
  decrypt: (value: string) => value,
}));

vi.mock('@/lib/certificate-manager', () => ({
  CertificateManager: {
    extractPems: () => ({ key: 'KEY', cert: 'CERT' }),
    cleanCnpj: (value: string) => value.replace(/\D/g, ''),
  },
}));

vi.mock('@/lib/sefaz-client', () => ({
  SefazClient: class {
    buscarNovosDocumentos = mocks.buscarNovosDocumentos;
  },
}));

vi.mock('@/lib/receita-nfse-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/receita-nfse-client')>();
  return {
    ...actual,
    ReceitaNfseClient: class {
      fetchDfeByNsu = mocks.fetchDfeByNsu;
    },
  };
});

vi.mock('@/lib/parse-invoice-xml', () => ({ parseInvoiceXml: mocks.parseInvoiceXml }));
vi.mock('@/lib/notification-outbox', () => ({ upsertInvoiceWithOutbox: mocks.upsert }));
// Só o tri-estado é substituído; o resto do módulo fica real, para que o
// controlo positivo (sefaz.ts original, que importa `applyNfeCancellation`)
// reproduza o defeito e não um export em falta.
vi.mock('@/lib/nfe-cancellation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/nfe-cancellation')>()),
  applyNfeCancellationOutcome: mocks.applyNfeCancellationOutcome,
}));
vi.mock('@/lib/xml-file-store', () => ({ saveXmlToFile: vi.fn(async () => undefined) }));
vi.mock('@/lib/product-aggregate-updater', () => ({
  updateProductAggregatesForInvoice: vi.fn(async () => undefined),
  scheduleNightlyRebuild: vi.fn(),
}));

const CERT = {
  id: 'cert-1',
  // Cifrado: `decryptPfx` é fail-closed desde a L4.
  pfxData: encryptPfx(Buffer.from('pfx'), COMPANY_CNPJ),
  pfxPassword: 'senha',
  lastNsu: '000000000000005',
  environment: 'production',
  subject: 'CN=EMPRESA, ST=MS',
};

const CHAVE_A = '5'.repeat(44);
const CHAVE_B = '6'.repeat(44);
const CHAVE_C = '7'.repeat(44);

function nfeDoc(nsuseq: string, chave: string) {
  return { nsuseq, chave, emitente: '', tipo: 'nfe' as const, xml: `<nfe>${chave}</nfe>`, schema: 'procNFe_v4.00.xsd' };
}

function eventoDoc(nsuseq: string, chave: string, xml = '<evento/>') {
  return { nsuseq, chave, emitente: '', tipo: 'evento' as const, xml, schema: 'procEventoNFe_v1.00.xsd' };
}

/** Cancelamento (110111) homologado (cStat 135) — o mesmo XML da prova do auditor. */
function procEventoCancelamento(chave: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe versao="1.00">
  <evento versao="1.00"><infEvento><chNFe>${chave}</chNFe><dhEvento>2026-08-20T14:00:00-03:00</dhEvento><tpEvento>110111</tpEvento></infEvento></evento>
  <retEvento versao="1.00"><infEvento><tpEvento>110111</tpEvento><chNFe>${chave}</chNFe><cStat>135</cStat><dhRegEvento>2026-08-20T14:30:00-03:00</dhRegEvento></infEvento></retEvento>
</procEventoNFe>`;
}

function uniqueViolation(target: string) {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target } });
}

function parsedInvoice(accessKey: string) {
  return {
    type: 'NFE' as const,
    accessKey,
    number: '1',
    series: '1',
    issueDate: '2026-01-10',
    senderCnpj: '11111111000191',
    senderName: 'FORNECEDOR',
    recipientCnpj: '22222222000191',
    recipientName: 'QLMED',
    totalValue: 10,
  };
}

async function runSefaz() {
  const { syncViaSefaz } = await import('@/lib/sync-strategies/sefaz');
  await syncViaSefaz('company-1', '22222222000191', 'QLMED', CERT, 'sync-log-1');
}

/** lastNsu efetivamente gravado no certificado. */
function persistedNsu(): string | undefined {
  const call = mocks.certUpdate.mock.calls.at(-1);
  return call?.[0]?.data?.lastNsu;
}

function syncLogPayload() {
  return mocks.syncLogUpdate.mock.calls.at(-1)?.[0]?.data;
}

describe('FISCAL-007 — SEFAZ DistDFe: cursor NSU não passa por documento falhado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.parseInvoiceXml.mockImplementation(async (xml: string) => {
      const chave = String(xml).replace(/[^0-9]/g, '');
      return parsedInvoice(chave);
    });
    mocks.upsert.mockResolvedValue({ invoice: { id: 'inv-1' }, isNewInvoice: true });
    mocks.applyNfeCancellationOutcome.mockResolvedValue('not-a-cancellation');
    mocks.skipUpsert.mockResolvedValue({ id: 'skip-1' });
  });

  it('congela o NSU imediatamente antes do documento que falhou no meio do lote', async () => {
    mocks.buscarNovosDocumentos.mockResolvedValue({
      status: 'success',
      cStat: '138',
      xMotivo: 'Documento localizado',
      ultNSU: '000000000000012',
      maxNSU: '000000000000012',
      failedNsus: [],
      docs: [
        nfeDoc('000000000000010', CHAVE_A),
        nfeDoc('000000000000011', CHAVE_B),
        nfeDoc('000000000000012', CHAVE_C),
      ],
    });
    // O documento do meio falha na gravação.
    mocks.upsert.mockImplementation(async (args: { where: { accessKey: string } }) => {
      if (args.where.accessKey === CHAVE_B) throw new Error('deadlock na gravação');
      return { invoice: { id: 'inv-1' }, isNewInvoice: true };
    });

    await runSefaz();

    // A prova: a posição final do cursor, não apenas que houve erro.
    expect(persistedNsu()).toBe('000000000000010');
    expect(syncLogPayload()).toMatchObject({ status: 'partial', skippedDocs: 1 });
    expect(syncLogPayload()?.errorMessage).toContain('gravacao_falhou');
  });

  it('XML inválido (parse falha e não é cancelamento) deixa o lastNsu inalterado', async () => {
    mocks.buscarNovosDocumentos.mockResolvedValue({
      status: 'success',
      cStat: '138',
      xMotivo: 'Documento localizado',
      ultNSU: '000000000000012',
      maxNSU: '000000000000012',
      failedNsus: [],
      docs: [nfeDoc('000000000000006', CHAVE_A), nfeDoc('000000000000012', CHAVE_C)],
    });
    mocks.parseInvoiceXml.mockResolvedValue(null);
    mocks.applyNfeCancellationOutcome.mockResolvedValue('not-a-cancellation');

    await runSefaz();

    // O primeiro documento do lote é ilegível: o cursor não sai de onde estava.
    expect(persistedNsu()).toBe('000000000000005');
    expect(syncLogPayload()).toMatchObject({ status: 'partial' });
    expect(syncLogPayload()?.errorMessage).toContain('parse_falhou_schema_desconhecido');
  });

  it('avança até o ultNSU do lote quando todos os documentos são gravados', async () => {
    mocks.buscarNovosDocumentos.mockResolvedValue({
      status: 'success',
      cStat: '138',
      xMotivo: 'Documento localizado',
      ultNSU: '000000000000012',
      maxNSU: '000000000000012',
      failedNsus: [],
      docs: [nfeDoc('000000000000010', CHAVE_A), nfeDoc('000000000000012', CHAVE_C)],
    });

    await runSefaz();

    expect(persistedNsu()).toBe('000000000000012');
    expect(syncLogPayload()).toMatchObject({ status: 'completed', skippedDocs: 0 });
  });

  it('trava o cursor também no documento que o client não conseguiu abrir', async () => {
    mocks.buscarNovosDocumentos.mockResolvedValue({
      status: 'success',
      cStat: '138',
      xMotivo: 'Documento localizado',
      ultNSU: '000000000000012',
      maxNSU: '000000000000012',
      // NSU entregue pela SEFAZ que morreu no gunzip/base64 dentro do client.
      failedNsus: ['000000000000011'],
      docs: [nfeDoc('000000000000010', CHAVE_A), nfeDoc('000000000000012', CHAVE_C)],
    });

    await runSefaz();

    expect(persistedNsu()).toBe('000000000000010');
    expect(syncLogPayload()).toMatchObject({ status: 'partial' });
  });

  it('não avança o cursor quando a SEFAZ responde erro (nenhum documento entregue)', async () => {
    mocks.buscarNovosDocumentos.mockResolvedValue({
      status: 'error',
      cStat: '656',
      xMotivo: 'Consumo Indevido',
      ultNSU: '000000000000099',
      maxNSU: '000000000000099',
      failedNsus: [],
      docs: [],
    });

    await runSefaz();

    expect(persistedNsu()).toBe('000000000000005');
    expect(syncLogPayload()).toMatchObject({ status: 'error' });
    // FISCAL-008: o lock de execução é largado mesmo no caminho de erro.
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  // REAUD-FISCAL-015 / REAUD-TEST-002: o teste antigo mockava o cancelamento a
  // `false` e cobria, sem distinguir, a ciência (deve passar) e o cancelamento
  // perdido (não deve). Com o tri-estado são dois casos — e a prova do auditor.
  const LOTE_COM_EVENTO = {
    status: 'success',
    cStat: '138',
    xMotivo: 'Documento localizado',
    ultNSU: '000000000000011',
    maxNSU: '000000000000011',
    failedNsus: [],
    docs: [eventoDoc('000000000000010', CHAVE_A), nfeDoc('000000000000011', CHAVE_B)],
  };

  it('ciência/carta de correção (not-a-cancellation) não trava o cursor', async () => {
    mocks.buscarNovosDocumentos.mockResolvedValue(LOTE_COM_EVENTO);
    mocks.applyNfeCancellationOutcome.mockResolvedValue('not-a-cancellation');

    await runSefaz();

    expect(persistedNsu()).toBe('000000000000011');
    expect(syncLogPayload()).toMatchObject({ status: 'completed', skippedDocs: 0 });
  });

  it('cancelamento perdido (lost) trava o cursor antes do evento', async () => {
    mocks.buscarNovosDocumentos.mockResolvedValue(LOTE_COM_EVENTO);
    mocks.applyNfeCancellationOutcome.mockResolvedValue('lost');

    await runSefaz();

    expect(persistedNsu()).toBe('000000000000009');
    expect(syncLogPayload()).toMatchObject({ status: 'partial', skippedDocs: 1 });
    expect(syncLogPayload()?.errorMessage).toContain('cancelamento_sem_nota');
  });

  // Prova do auditor, de ponta a ponta: procEventoNFe 110111/135 REAL, módulo
  // de cancelamento REAL, `invoice.updateMany → {count:0}` e nota inexistente.
  // Antes da correção: cursor `000000000000010`, `completed`, skippedDocs 0.
  it('cancelamento real cuja nota não existe nesta base trava o cursor (prova do auditor)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/nfe-cancellation')>('@/lib/nfe-cancellation');
    mocks.applyNfeCancellationOutcome.mockImplementation(actual.applyNfeCancellationOutcome);
    mocks.invoiceUpdateMany.mockResolvedValue({ count: 0 });
    mocks.invoiceCount.mockResolvedValue(0);
    mocks.buscarNovosDocumentos.mockResolvedValue({
      status: 'success',
      cStat: '138',
      xMotivo: 'Documento localizado',
      ultNSU: '000000000000010',
      maxNSU: '000000000000010',
      failedNsus: [],
      docs: [eventoDoc('000000000000010', CHAVE_A, procEventoCancelamento(CHAVE_A))],
    });

    await runSefaz();

    expect(mocks.invoiceUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: 'company-1', accessKey: CHAVE_A, cancelledAt: null },
    }));
    expect(persistedNsu()).toBe('000000000000009');
    expect(syncLogPayload()).toMatchObject({ status: 'partial', skippedDocs: 1 });
  });

  // REAUD-DATA-015: o unique parcial de NF-e emitida (20260901180000) transforma
  // uma duplicata silenciosa numa P2002. Reter o cursor aqui é falha
  // DETERMINÍSTICA — a corrida seguinte tropeça no mesmo NSU e a ingestão da
  // empresa para até intervenção manual.
  const LOTE_TRES = {
    status: 'success',
    cStat: '138',
    xMotivo: 'Documento localizado',
    ultNSU: '000000000000012',
    maxNSU: '000000000000012',
    failedNsus: [],
    docs: [nfeDoc('000000000000010', CHAVE_A), nfeDoc('000000000000011', CHAVE_B), nfeDoc('000000000000012', CHAVE_C)],
  };

  it('P2002 no upsert regista skip durável por chave e o cursor segue', async () => {
    mocks.buscarNovosDocumentos.mockResolvedValue(LOTE_TRES);
    mocks.upsert.mockImplementation(async (args: { where: { accessKey: string } }) => {
      if (args.where.accessKey === CHAVE_B) throw uniqueViolation('Invoice_issued_nfe_companyId_series_number_key');
      return { invoice: { id: 'inv-1' }, isNewInvoice: true };
    });

    await runSefaz();

    // O cursor passa por cima do documento — mas ele ficou gravado, com XML.
    expect(persistedNsu()).toBe('000000000000012');
    expect(mocks.skipUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.skipUpsert.mock.calls[0][0]).toMatchObject({
      where: { companyId_accessKey: { companyId: 'company-1', accessKey: CHAVE_B } },
      create: { companyId: 'company-1', accessKey: CHAVE_B, nsu: '000000000000011', reason: 'unique_violado', xmlContent: `<nfe>${CHAVE_B}</nfe>` },
    });
    expect(syncLogPayload()).toMatchObject({ status: 'partial', skippedDocs: 1, newDocs: 2 });
    expect(syncLogPayload()?.errorMessage).toContain('unique_violado');
    expect(syncLogPayload()?.errorMessage).toContain('Invoice_issued_nfe_companyId_series_number_key');
  });

  it('se o skip durável não grava, o cursor não avança (fail-closed)', async () => {
    mocks.buscarNovosDocumentos.mockResolvedValue(LOTE_TRES);
    mocks.upsert.mockImplementation(async (args: { where: { accessKey: string } }) => {
      if (args.where.accessKey === CHAVE_B) throw uniqueViolation('Invoice_issued_nfe_companyId_series_number_key');
      return { invoice: { id: 'inv-1' }, isNewInvoice: true };
    });
    mocks.skipUpsert.mockRejectedValue(new Error('relation "SyncSkippedDocument" does not exist'));

    await runSefaz();

    expect(persistedNsu()).toBe('000000000000005');
    expect(syncLogPayload()).toMatchObject({ status: 'error' });
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});

describe('FISCAL-007 — Receita NFS-e: cursor NSU não passa por documento falhado', () => {
  const OPTIONS = {
    companyId: 'company-1',
    companyCnpj: '22222222000191',
    config: {
      id: 'receita-1',
      apiToken: null,
      lastNsu: '000000000000000',
      cnpjConsulta: '22222222000191',
      environment: 'production',
      baseUrl: null,
    },
    certificate: { pfxData: encryptPfx(Buffer.from('pfx'), COMPANY_CNPJ), pfxPassword: 'senha' },
    maxSteps: 5,
    maxEmptySteps: 1,
  };

  function nfseResponse(documents: string[]) {
    return { statusCode: 200, contentType: 'application/json', rawBody: '{}', documents, nsuHints: [], isEmpty: false, parseFailed: false };
  }
  const EMPTY = { statusCode: 404, contentType: 'application/json', rawBody: '', documents: [], nsuHints: [], isEmpty: true, parseFailed: false };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.upsert.mockResolvedValue({ invoice: { id: 'inv-1' }, isNewInvoice: true });
  });

  it('para no NSU anterior quando um documento do NSU não é gravável', async () => {
    mocks.fetchDfeByNsu
      .mockResolvedValueOnce(nfseResponse(['<nfse>bom</nfse>']))
      .mockResolvedValueOnce(nfseResponse(['<nfse>bom2</nfse>', '<lixo/>']))
      .mockResolvedValue(EMPTY);
    mocks.parseInvoiceXml.mockImplementation(async (xml: string) =>
      String(xml).includes('lixo')
        ? null
        : { ...parsedInvoice(`NFSE${'9'.repeat(25)}`), type: 'NFSE' as const },
    );

    const { syncReceitaNfseByNsu } = await import('@/lib/receita-nfse-sync');
    const result = await syncReceitaNfseByNsu({ ...OPTIONS, prisma: { invoice: { upsert: vi.fn() } } } as never);

    // O NSU 2 entregou um documento ilegível: o cursor fica no NSU 1.
    expect(result.lastNsu).toBe('000000000000001');
    expect(result.skippedDocs).toBe(1);
    expect(result.skippedReasons[0]).toContain('nsu=000000000000002');
  });

  it('avança normalmente quando todo o conteúdo do NSU é gravado', async () => {
    mocks.fetchDfeByNsu
      .mockResolvedValueOnce(nfseResponse(['<nfse>a</nfse>']))
      .mockResolvedValueOnce(nfseResponse(['<nfse>b</nfse>']))
      .mockResolvedValue(EMPTY);
    mocks.parseInvoiceXml.mockResolvedValue({ ...parsedInvoice(`NFSE${'9'.repeat(25)}`), type: 'NFSE' as const });

    const { syncReceitaNfseByNsu } = await import('@/lib/receita-nfse-sync');
    const result = await syncReceitaNfseByNsu({ ...OPTIONS, prisma: { invoice: { upsert: vi.fn() } } } as never);

    expect(result.lastNsu).toBe('000000000000002');
    expect(result.skippedDocs).toBe(0);
  });

  it('marca a corrida como partial em vez de completed quando pulou documento', async () => {
    mocks.fetchDfeByNsu
      .mockResolvedValueOnce(nfseResponse(['<lixo/>']))
      .mockResolvedValue(EMPTY);
    mocks.parseInvoiceXml.mockResolvedValue(null);

    const { syncViaReceitaNfse } = await import('@/lib/receita-nfse-sync');
    await syncViaReceitaNfse(
      'company-1',
      '22222222000191',
      'QLMED',
      { id: 'receita-1', apiToken: null, lastNsu: '000000000000000', cnpjConsulta: '22222222000191', environment: 'production', baseUrl: null },
      { pfxData: encryptPfx(Buffer.from('pfx'), COMPANY_CNPJ), pfxPassword: 'senha' },
      'sync-log-1',
    );

    expect(syncLogPayload()).toMatchObject({ status: 'partial', skippedDocs: 1 });
    expect(mocks.receitaConfigUpdate.mock.calls.at(-1)?.[0]?.data?.lastNsu).toBe('000000000000000');
  });
});
