/**
 * Regressão da auditoria b177b07, backlog 1. O assunto aqui é a máquina de
 * estado da emissão, não a montagem do XML — por isso emitente, destinatário,
 * builder e assinatura são mocks. O que é fiel ao Postgres: `$transaction`
 * serializa (é o `pg_advisory_xact_lock`) e `updateMany` só casa quando o
 * status ainda está no `where`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptPfx } from '@/lib/certificate-secret';

process.env.ENCRYPTION_KEY = 'test-encryption-key-for-vitest-32chars!';

const EMISSION_ID = 'em1';
const COMPANY_ID = 'co1';

type EmissionRow = {
  id: string;
  companyId: string;
  status: 'draft' | 'submitted' | 'authorized' | 'rejected';
  series: string;
  number: string | null;
  accessKey: string | null;
  signedXml: string | null;
  protocolXml: string | null;
  invoiceId: string | null;
  sefazStat: string | null;
  sefazMotivo: string | null;
  payload: unknown;
};

const payload = {
  natureza: 'Remessa em consignacao',
  series: '2',
  cfop: '5917',
  destCnpj: '12345678000199',
  indFinal: '0' as const,
  items: [{
    productId: 'p1',
    cProd: 'X',
    xProd: 'Item',
    ncm: '90213980',
    cfop: '5917',
    uCom: 'UN',
    qCom: '1',
    vUnCom: '10.00',
  }],
};

let emission: EmissionRow;
let invoices: Array<{ id: string; accessKey: string }>;

function freshEmission(overrides: Partial<EmissionRow> = {}): EmissionRow {
  return {
    id: EMISSION_ID,
    companyId: COMPANY_ID,
    status: 'draft',
    series: '2',
    number: null,
    accessKey: null,
    signedXml: null,
    protocolXml: null,
    invoiceId: null,
    sefazStat: null,
    sefazMotivo: null,
    payload,
    ...overrides,
  };
}

/** Uma transação por vez, como o advisory lock por empresa faz em produção. */
let txChain: Promise<unknown> = Promise.resolve();

const emissionDelegate = {
  findFirst: vi.fn(async () => ({ ...emission })),
  findMany: vi.fn(async () => [] as Array<{ number: string | null }>),
  update: vi.fn(async ({ data }: { data: Partial<EmissionRow> }) => {
    Object.assign(emission, data);
    return { ...emission };
  }),
  updateMany: vi.fn(async ({ where, data }: {
    where: { id: string; status?: { in: string[] } };
    data: Partial<EmissionRow>;
  }) => {
    if (where.id !== emission.id) return { count: 0 };
    if (where.status?.in && !where.status.in.includes(emission.status)) return { count: 0 };
    Object.assign(emission, data);
    return { count: 1 };
  }),
};

const mockPrisma = {
  invoiceEmission: emissionDelegate,
  invoice: {
    findFirst: vi.fn(async () => ({ xmlContent: '<nfeProc/>' })),
    findMany: vi.fn(async () => [{ recipientCnpj: '12345678000199' }]),
    findUnique: vi.fn(async ({ where }: { where: { accessKey: string } }) =>
      invoices.find((row) => row.accessKey === where.accessKey) || null),
  },
  company: { findFirstOrThrow: vi.fn(async () => ({ id: COMPANY_ID, cnpj: '11222333000181' })) },
  certificateConfig: {
    findUnique: vi.fn(async () => ({
      companyId: COMPANY_ID,
      // Cifrado de verdade: o `decryptPfx` é fail-closed desde a folha L4 e
      // recusa PFX em claro. Usar a cifra real aqui exercita o caminho de
      // produção em vez de o contornar com um mock.
      pfxData: encryptPfx(Buffer.from('pfx'), '11222333000181'),
      pfxPassword: 'enc',
      environment: 'homologation',
      validTo: new Date(Date.now() + 86400000),
    })),
  },
  contactFiscal: { findUnique: vi.fn(async () => null) },
  contactOverride: { findUnique: vi.fn(async () => null) },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const run = txChain.then(() => fn({
      ...mockPrisma,
      $queryRaw: async () => [{ acquired: true }],
    }));
    txChain = run.catch(() => undefined);
    return run;
  }),
};

vi.mock('@/lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));

vi.mock('@/lib/certificate-manager', () => ({
  CertificateManager: { extractPems: () => ({ cert: 'CERT', key: 'KEY' }) },
}));
// Só o `decrypt` é substituído: `encryptPfx` usa `deriveKey` do módulo real,
// e mockar o módulo inteiro tirava a cifra que este teste quer exercitar.
vi.mock('@/lib/crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/crypto')>()),
  decrypt: () => 'pw',
}));
vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresTransactionAdvisoryLock: async () => undefined,
}));
vi.mock('@/lib/notification-outbox', () => ({
  createInvoiceWithOutbox: vi.fn(async ({ data }: { data: { accessKey: string } }) => {
    const invoice = { id: `inv-${invoices.length + 1}`, accessKey: data.accessKey };
    invoices.push(invoice);
    return { invoice, eventCreated: true };
  }),
}));
vi.mock('@/lib/xml-file-store', () => ({ saveXmlToFile: vi.fn(async () => undefined) }));
vi.mock('@/lib/product-aggregate-updater', () => ({
  updateProductAggregatesForInvoice: vi.fn(async () => undefined),
}));
vi.mock('@/lib/nfe-emission/emitente', () => ({
  emitenteFromIssuedXml: async () => ({
    cnpj: '11222333000181',
    xNome: 'QLMED',
    ender: { UF: 'MS' },
  }),
}));
vi.mock('@/lib/nfe-emission/destinatario', () => ({
  destinatarioFromIssuedXml: async () => null,
  mergeDestinatario: () => ({
    cnpj: '12345678000199',
    xNome: 'Hospital',
    ender: { UF: 'MS', cMun: '5002704' },
  }),
}));
vi.mock('@/lib/nfe-emission/operations', () => ({
  assertCfopMatchesUfs: () => undefined,
  getSaidaOperation: () => ({ natureza: 'Remessa em consignacao' }),
}));
vi.mock('@/lib/nfe-emission/xml-builder', () => ({
  buildUnsignedNfeXml: () => '<NFe/>',
  draftDocumentTotal: () => 10,
  draftTotalValue: () => 10,
}));
vi.mock('@/lib/nfe-emission/xml-sign', () => ({ signNfeXml: () => '<NFe signed="1"/>' }));

async function loadAuthorize() {
  const mod = await import('@/lib/nfe-emission/authorize');
  return mod.authorizeInvoiceEmission;
}

function authorizedResponse() {
  return {
    outcome: 'authorized' as const,
    cStat: '100',
    xMotivo: 'Autorizado o uso da NF-e',
    nProt: '150260000000001',
    xmlAutorizado: '<nfeProc/>',
  };
}

beforeEach(() => {
  emission = freshEmission();
  invoices = [];
  txChain = Promise.resolve();
  vi.clearAllMocks();
});

describe('authorizeInvoiceEmission — atomicidade', () => {
  it('dois authorize concorrentes enviam à SEFAZ exatamente uma vez', async () => {
    const authorize = await loadAuthorize();
    const send = vi.fn(async () => {
      // Janela real entre o commit da numeração e a resposta da SEFAZ.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return authorizedResponse();
    });

    const [a, b] = await Promise.all([
      authorize(COMPANY_ID, EMISSION_ID, { send }),
      authorize(COMPANY_ID, EMISSION_ID, { send }),
    ]);

    expect(send).toHaveBeenCalledTimes(1);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(['authorized', 'pending']);
    expect(invoices).toHaveLength(1);
  });

  it('timeout no envio mantém submitted, número e chave — não vira rejeição', async () => {
    const authorize = await loadAuthorize();
    const send = vi.fn(async () => {
      throw new Error('SEFAZ timeout após 30000ms (autorização)');
    });

    const result = await authorize(COMPANY_ID, EMISSION_ID, { send });

    expect(result.status).toBe('pending');
    expect(emission.status).toBe('submitted');
    expect(emission.number).not.toBeNull();
    expect(emission.accessKey).not.toBeNull();
    expect(emission.sefazMotivo).toContain('timeout');
  });

  it('lote aceito sem protocolo fica pendente e não libera o número', async () => {
    const authorize = await loadAuthorize();
    const send = vi.fn(async () => ({
      outcome: 'pending' as const,
      cStat: '103',
      xMotivo: 'Lote recebido com sucesso',
    }));

    const result = await authorize(COMPANY_ID, EMISSION_ID, { send });

    expect(result.status).toBe('pending');
    expect(emission.status).toBe('submitted');
    expect(emission.accessKey).not.toBeNull();
  });

  it('rejeição definitiva libera número e chave para nova tentativa', async () => {
    const authorize = await loadAuthorize();
    const send = vi.fn(async () => ({
      outcome: 'rejected' as const,
      cStat: '539',
      xMotivo: 'Duplicidade de NF-e',
    }));

    const result = await authorize(COMPANY_ID, EMISSION_ID, { send });

    expect(result.status).toBe('rejected');
    expect(emission.status).toBe('rejected');
    expect(emission.number).toBeNull();
    expect(emission.accessKey).toBeNull();
  });
});

describe('authorizeInvoiceEmission — reentrada em submitted', () => {
  it('consulta o protocolo em vez de reenviar', async () => {
    emission = freshEmission({
      status: 'submitted',
      number: '7',
      accessKey: '5026'.padEnd(44, '0'),
      signedXml: '<NFe signed="1"/>',
    });
    const authorize = await loadAuthorize();
    const send = vi.fn();
    const consult = vi.fn(async () => ({
      outcome: 'authorized' as const,
      cStat: '100',
      xMotivo: 'Autorizado o uso da NF-e',
      protNFe: '<protNFe/>',
    }));

    const result = await authorize(COMPANY_ID, EMISSION_ID, { send, consult });

    expect(send).not.toHaveBeenCalled();
    expect(consult).toHaveBeenCalledTimes(1);
    // A nota está na SEFAZ mas ainda não virou Invoice aqui: não pode fechar
    // como autorizada nem emitir outra.
    expect(result.status).toBe('pending');
    expect(emission.accessKey).not.toBeNull();
  });

  it('fecha a emissão quando a Invoice da chave já existe', async () => {
    const accessKey = '5026'.padEnd(44, '0');
    emission = freshEmission({
      status: 'submitted',
      number: '7',
      accessKey,
      signedXml: '<NFe signed="1"/>',
    });
    invoices = [{ id: 'inv-existente', accessKey }];
    const authorize = await loadAuthorize();
    const send = vi.fn();
    const consult = vi.fn(async () => ({
      outcome: 'authorized' as const,
      cStat: '100',
      xMotivo: 'Autorizado o uso da NF-e',
      protNFe: '<protNFe/>',
    }));

    const result = await authorize(COMPANY_ID, EMISSION_ID, { send, consult });

    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'authorized', invoiceId: 'inv-existente' });
    expect(emission.status).toBe('authorized');
  });

  it('cStat 217 devolve o rascunho e só então libera número e chave', async () => {
    emission = freshEmission({
      status: 'submitted',
      number: '7',
      accessKey: '5026'.padEnd(44, '0'),
      signedXml: '<NFe signed="1"/>',
    });
    const authorize = await loadAuthorize();
    const send = vi.fn();
    const consult = vi.fn(async () => ({
      outcome: 'absent' as const,
      cStat: '217',
      xMotivo: 'NF-e não consta na base de dados da SEFAZ',
    }));

    const result = await authorize(COMPANY_ID, EMISSION_ID, { send, consult });

    expect(send).not.toHaveBeenCalled();
    expect(result.status).toBe('pending');
    expect(emission.status).toBe('draft');
    expect(emission.number).toBeNull();
    expect(emission.accessKey).toBeNull();
  });

  it('consulta indisponível não reenvia nem mexe no estado', async () => {
    emission = freshEmission({
      status: 'submitted',
      number: '7',
      accessKey: '5026'.padEnd(44, '0'),
      signedXml: '<NFe signed="1"/>',
    });
    const authorize = await loadAuthorize();
    const send = vi.fn();
    const consult = vi.fn(async () => { throw new Error('SEFAZ HTTP 503'); });

    const result = await authorize(COMPANY_ID, EMISSION_ID, { send, consult });

    expect(send).not.toHaveBeenCalled();
    expect(result.status).toBe('pending');
    expect(emission.status).toBe('submitted');
    expect(emission.number).toBe('7');
  });
});
