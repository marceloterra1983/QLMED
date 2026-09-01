import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    applyNfeCancellation: vi.fn(),
    release: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => {
  const client = {
    certificateConfig: { update: mocks.certUpdate },
    receitaNfseConfig: { update: mocks.receitaConfigUpdate },
    syncLog: { update: mocks.syncLogUpdate },
  };
  return { prisma: client, default: client };
});

vi.mock('@/lib/postgres-advisory-lock', () => ({
  beginSyncRun: vi.fn(async () => ({ syncLogId: 'sync-log-1', release: mocks.release })),
}));

vi.mock('@/lib/crypto', () => ({ decrypt: (value: string) => value }));

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
vi.mock('@/lib/nfe-cancellation', () => ({ applyNfeCancellation: mocks.applyNfeCancellation }));
vi.mock('@/lib/xml-file-store', () => ({ saveXmlToFile: vi.fn(async () => undefined) }));
vi.mock('@/lib/product-aggregate-updater', () => ({
  updateProductAggregatesForInvoice: vi.fn(async () => undefined),
  scheduleNightlyRebuild: vi.fn(),
}));

const CERT = {
  id: 'cert-1',
  pfxData: Buffer.from('pfx'),
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
    mocks.applyNfeCancellation.mockResolvedValue(false);
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
    mocks.applyNfeCancellation.mockResolvedValue(false);

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

  it('evento não gravável não trava o cursor (ciência/carta de correção são a maioria)', async () => {
    mocks.buscarNovosDocumentos.mockResolvedValue({
      status: 'success',
      cStat: '138',
      xMotivo: 'Documento localizado',
      ultNSU: '000000000000011',
      maxNSU: '000000000000011',
      failedNsus: [],
      docs: [
        { nsuseq: '000000000000010', chave: CHAVE_A, emitente: '', tipo: 'evento' as const, xml: '<evento/>', schema: 'resEvento_v1.01.xsd' },
        nfeDoc('000000000000011', CHAVE_B),
      ],
    });

    await runSefaz();

    expect(persistedNsu()).toBe('000000000000011');
    expect(syncLogPayload()).toMatchObject({ status: 'completed' });
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
    certificate: { pfxData: Buffer.from('pfx'), pfxPassword: 'senha' },
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
      { pfxData: Buffer.from('pfx'), pfxPassword: 'senha' },
      'sync-log-1',
    );

    expect(syncLogPayload()).toMatchObject({ status: 'partial', skippedDocs: 1 });
    expect(mocks.receitaConfigUpdate.mock.calls.at(-1)?.[0]?.data?.lastNsu).toBe('000000000000000');
  });
});
