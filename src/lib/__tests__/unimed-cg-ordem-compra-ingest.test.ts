import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnimedCgIngestDeps } from '@/lib/unimed-cg/ingest';
import type { UnimedCgPurchaseOrderStorePort } from '@/lib/unimed-cg/ingest-purchase-order';

const OC_SUBJECT = 'Ordem de compras 188246 - QL MED MATERIAIS HOSPITALARES LTDA';
const OC_TEXT = `
Relatório de Ordem de Compra
Ord. Compra: 188246              Solicitação: 143041
Dt Ord. Compra: 04/09/2026
Fornecedor: 436 QL MED - QL MED MATERIAIS HOSPITALARES LTDA
CNPJ/CPF: 07.832.309/0001-97
Comprador: UNIMED CAMPO GRANDE MS COOPERATIVA DE TRABALHO MEDICO
Endereço: AVENIDA MATO GROSSO Nº 4566  CNPJ: 03.315.918/0005-41
Cód. Condição de Pgto.: 7             Desc. Condição de Pgto.: 30 DIAS
Produto                      Fabricante   Lote          Qt. Cons. Unidade      Qtd Compr.    Vl.Unit.    Vl Desc. %Des         Vl IMP    Vl Total
78811 - EXTENSOR DE BOMBA - REF. SM-PL-12P120RF-MP                    UNIDADE         50,0000   42,0000       0,0000    0,00      0,0000    2.100,00
                                                           Valor Total (=):                                         2.100,00
`;

const memory = vi.hoisted(() => ({
  orders: [] as Array<{ id: string; orderNumber: string; parseStatus: 'ok' | 'parcial' | 'falha'; oneDriveItemId: string }>,
  sources: [] as Array<{ id: string; internetMessageId: string; purchaseOrderId: string | null }>,
  uploads: 0,
  seq: 1,
}));

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: vi.fn(async () => ({ release: async () => undefined })),
  unimedCgMailIngestLockKey: (companyId: string) => `unimed-cg-mail-ingest:${companyId}`,
}));

vi.mock('@/lib/unimed-cg/opme-portal', () => ({
  openOpmePortalSession: vi.fn(async () => null),
  getOpmePortalCredentialsFromEnv: vi.fn(() => null),
}));

vi.mock('@/lib/unimed-cg/billing-match', () => ({
  runUnimedCgBillingMatch: vi.fn(async () => ({ matched: 0, ambiguous: 0 })),
}));

function reset() {
  memory.orders.length = 0;
  memory.sources.length = 0;
  memory.uploads = 0;
  memory.seq = 1;
}

function poStore(): UnimedCgPurchaseOrderStorePort {
  return {
    async findSourceByInternetMessageId(_c, internetMessageId) {
      const row = memory.sources.find((item) => item.internetMessageId === internetMessageId);
      return row ? { id: row.id, purchaseOrderId: row.purchaseOrderId } : null;
    },
    async findByOrderNumber(_c, orderNumber) {
      return memory.orders.find((row) => row.orderNumber === orderNumber) ?? null;
    },
    async persistConfirmed(input) {
      const id = `oc-${memory.seq++}`;
      memory.orders.push({
        id,
        orderNumber: input.orderNumber,
        parseStatus: input.parseStatus,
        oneDriveItemId: input.oneDriveItemId,
      });
      if (input.internetMessageId) {
        memory.sources.push({
          id: `osrc-${memory.seq++}`,
          internetMessageId: input.internetMessageId,
          purchaseOrderId: id,
        });
      }
      return { id };
    },
    async persistUpgrade(input) {
      const row = memory.orders.find((item) => item.id === input.purchaseOrderId);
      if (!row) throw new Error('missing oc');
      row.parseStatus = input.parseStatus;
      row.oneDriveItemId = input.oneDriveItemId;
    },
    async persistSourceOnly(input) {
      if (memory.sources.some((row) => row.internetMessageId === input.internetMessageId)) return;
      memory.sources.push({
        id: `osrc-${memory.seq++}`,
        internetMessageId: input.internetMessageId,
        purchaseOrderId: input.purchaseOrderId,
      });
    },
  };
}

function emptyKindStore() {
  return {
    async findSourceByInternetMessageId() { return null; },
    async findByProcessId() { return null; },
    async findByPreSolicitationId() { return null; },
    async persistConfirmed() { return { id: 'x' }; },
    async persistUpgrade() { return; },
    async persistSourceOnly() { return; },
    async loadIngestState() { return null; },
    async saveIngestState() { return; },
  };
}

function deps(): UnimedCgIngestDeps {
  return {
    mail: {
      async listMessages() { return []; },
      async getBodyHtml() { return { contentType: 'html', content: '' }; },
      async listPurchaseOrderMessages(mailbox: string) {
        if (!mailbox.startsWith('marcelo@')) return [];
        return [{
          graphMessageId: 'graph-oc-1',
          internetMessageId: '<oc-1@unimedcg.coop.br>',
          subject: OC_SUBJECT,
          receivedAt: new Date('2026-09-04T15:25:00Z'),
          hasAttachments: true,
        }];
      },
      async getPdfAttachments() {
        return [{ name: 'OC 188246 QL MED.pdf', content: Buffer.from('%PDF-1.4 oc') }];
      },
    },
    drive: {
      async uploadPdf() {
        memory.uploads += 1;
        return { itemId: `od-oc-${memory.uploads}` };
      },
    },
    fetch: {
      async fetchHtml() { return ''; },
      async renderPdf() { return Buffer.from('%PDF-1.4'); },
      async renderHtmlPdf() { return Buffer.from('%PDF-1.4'); },
    },
    store: emptyKindStore() as UnimedCgIngestDeps['store'],
    deliveryStore: emptyKindStore() as UnimedCgIngestDeps['deliveryStore'],
    reversalStore: emptyKindStore() as UnimedCgIngestDeps['reversalStore'],
    preSolicitationStore: emptyKindStore() as UnimedCgIngestDeps['preSolicitationStore'],
    invoiceDeadlineStore: emptyKindStore() as UnimedCgIngestDeps['invoiceDeadlineStore'],
    purchaseOrderStore: poStore(),
    extractPurchaseOrderText: async () => OC_TEXT,
    whatsapp: null,
  };
}

describe('unimed-cg ordem de compra ingest', () => {
  beforeEach(() => {
    reset();
  });

  it('persiste OC nova uma vez', async () => {
    const { runUnimedCgIngest } = await import('@/lib/unimed-cg/ingest');
    const result = await runUnimedCgIngest('co1', deps());
    expect(result.processed).toBe(1);
    expect(memory.orders).toHaveLength(1);
    expect(memory.orders[0]?.orderNumber).toBe('188246');
    expect(memory.uploads).toBe(1);
  });

  it('dedup por internetMessageId na segunda passagem', async () => {
    const { runUnimedCgIngest } = await import('@/lib/unimed-cg/ingest');
    const d = deps();
    await runUnimedCgIngest('co1', d);
    const second = await runUnimedCgIngest('co1', d);
    expect(second.processed).toBe(0);
    expect(memory.orders).toHaveLength(1);
    expect(memory.uploads).toBe(1);
  });

  it('ignora assunto que não é ordem de compra', async () => {
    const { runUnimedCgIngest } = await import('@/lib/unimed-cg/ingest');
    const d = deps();
    d.mail.listPurchaseOrderMessages = async (mailbox: string) => {
      if (!mailbox.startsWith('marcelo@')) return [];
      return [{
        graphMessageId: 'graph-x',
        internetMessageId: '<other@unimedcg.coop.br>',
        subject: 'Reunião de rotina',
        receivedAt: new Date(),
        hasAttachments: true,
      }];
    };
    const result = await runUnimedCgIngest('co1', d);
    expect(result.processed).toBe(0);
    expect(memory.orders).toHaveLength(0);
  });
});
