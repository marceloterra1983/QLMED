import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  UnimedCgIngestDeps,
  UnimedCgStorePort,
  UnimedCgDeliveryStorePort,
  PersistArgs,
  PersistDeliveryArgs,
} from '@/lib/unimed-cg/ingest';

const UNIMED_CG_PAGE_FIXTURE = `
<html><body>
<p>Processo: 75576</p>
<p>GIH: 0</p>
<p>Autorização: 260291512</p>
<p>Tipo de procedimento: Eletivo</p>
<p>Data prevista do Procedimento: 06/08/2026</p>
<p>Local: UNIMED CAMPO GRANDE MS COOP TRAB MED</p>
<p>Valor total: R$ 5.289,00</p>
</body></html>
`;

const SUBJECT = '[ID 75576] [OPME] autorização de faturamento do processo';
const LINK = 'https://unimedcg.opmes.com.br/gestao/www/visualiza-email-processo.php?id=75576';

type AuthRow = {
  id: string;
  processId: string;
  parseStatus: 'ok' | 'parcial' | 'falha';
  oneDriveItemId: string;
};

type SourceRow = {
  id: string;
  internetMessageId: string;
  mailbox: string;
  authorizationId: string | null;
};

const memory = vi.hoisted(() => ({
  authorizations: [] as AuthRow[],
  sources: [] as SourceRow[],
  deliveryAuthorizations: [] as AuthRow[],
  deliverySources: [] as SourceRow[],
  ingestState: null as {
    lastSuccessAt: Date | null;
    backfillCompletedAt: Date | null;
    lastError: string | null;
  } | null,
  seq: 1,
  uploads: 0,
}));

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: vi.fn(async () => ({ release: async () => undefined })),
  unimedCgMailIngestLockKey: (companyId: string) => `unimed-cg-mail-ingest:${companyId}`,
}));

function resetMemory() {
  memory.authorizations.length = 0;
  memory.sources.length = 0;
  memory.deliveryAuthorizations.length = 0;
  memory.deliverySources.length = 0;
  memory.ingestState = null;
  memory.seq = 1;
  memory.uploads = 0;
}

function memoryStore(): UnimedCgStorePort {
  return {
    async findSourceByInternetMessageId(_companyId, internetMessageId) {
      const row = memory.sources.find((item) => item.internetMessageId === internetMessageId);
      return row ? { id: row.id, authorizationId: row.authorizationId, whatsappSentAt: null } : null;
    },
    async findByProcessId(_companyId, processId) {
      return memory.authorizations.find((row) => row.processId === processId) ?? null;
    },
    async persistConfirmed(input: PersistArgs) {
      const id = `auth-${memory.seq++}`;
      memory.authorizations.push({
        id,
        processId: input.processId,
        parseStatus: input.parseStatus,
        oneDriveItemId: input.oneDriveItemId,
      });
      if (input.internetMessageId) {
        memory.sources.push({
          id: `src-${memory.seq++}`,
          internetMessageId: input.internetMessageId,
          mailbox: input.mailbox ?? '',
          authorizationId: id,
        });
      }
      return { id };
    },
    async persistUpgrade(input: PersistArgs & { authorizationId: string }) {
      const row = memory.authorizations.find((item) => item.id === input.authorizationId);
      if (!row) throw new Error('authorization missing');
      row.parseStatus = input.parseStatus;
      row.oneDriveItemId = input.oneDriveItemId;
      if (input.internetMessageId) {
        memory.sources.push({
          id: `src-${memory.seq++}`,
          internetMessageId: input.internetMessageId,
          mailbox: input.mailbox ?? '',
          authorizationId: input.authorizationId,
        });
      }
    },
    async persistSourceOnly(input) {
      if (memory.sources.some((row) => row.internetMessageId === input.internetMessageId)) return;
      memory.sources.push({
        id: `src-${memory.seq++}`,
        internetMessageId: input.internetMessageId,
        mailbox: input.mailbox,
        authorizationId: input.authorizationId,
      });
    },
    async loadIngestState() {
      return memory.ingestState;
    },
    async saveIngestState(_companyId, patch) {
      memory.ingestState = {
        lastSuccessAt: patch.lastSuccessAt ?? memory.ingestState?.lastSuccessAt ?? null,
        backfillCompletedAt: patch.backfillCompletedAt ?? memory.ingestState?.backfillCompletedAt ?? null,
        lastError: patch.lastError ?? null,
      };
    },
  };
}


function memoryDeliveryStore(): UnimedCgDeliveryStorePort {
  return {
    async findSourceByInternetMessageId(_companyId, internetMessageId) {
      const row = memory.deliverySources.find((item) => item.internetMessageId === internetMessageId);
      return row ? { id: row.id, authorizationId: row.authorizationId, whatsappSentAt: null } : null;
    },
    async findByProcessId(_companyId, processId) {
      return memory.deliveryAuthorizations.find((row) => row.processId === processId) ?? null;
    },
    async persistConfirmed(input: PersistDeliveryArgs) {
      const id = `dauth-${memory.seq++}`;
      memory.deliveryAuthorizations.push({
        id,
        processId: input.processId,
        parseStatus: input.parseStatus,
        oneDriveItemId: input.oneDriveItemId,
      });
      if (input.internetMessageId) {
        memory.deliverySources.push({
          id: `dsrc-${memory.seq++}`,
          internetMessageId: input.internetMessageId,
          mailbox: input.mailbox ?? '',
          authorizationId: id,
        });
      }
      return { id };
    },
    async persistUpgrade(input: PersistDeliveryArgs & { authorizationId: string }) {
      const row = memory.deliveryAuthorizations.find((item) => item.id === input.authorizationId);
      if (!row) throw new Error('delivery authorization missing');
      row.parseStatus = input.parseStatus;
      row.oneDriveItemId = input.oneDriveItemId;
      if (input.internetMessageId) {
        memory.deliverySources.push({
          id: `dsrc-${memory.seq++}`,
          internetMessageId: input.internetMessageId,
          mailbox: input.mailbox ?? '',
          authorizationId: input.authorizationId,
        });
      }
    },
    async persistSourceOnly(input) {
      if (memory.deliverySources.some((row) => row.internetMessageId === input.internetMessageId)) return;
      memory.deliverySources.push({
        id: `dsrc-${memory.seq++}`,
        internetMessageId: input.internetMessageId,
        mailbox: input.mailbox,
        authorizationId: input.authorizationId,
      });
    },
  };
}

function deps(overrides: Partial<UnimedCgIngestDeps> = {}): UnimedCgIngestDeps {
  return {
    mail: {
      async listMessages() {
        return [
          {
            graphMessageId: 'graph-1',
            internetMessageId: '<msg-1@unimedcg>',
            subject: SUBJECT,
            receivedAt: new Date(),
            hasAttachments: false,
          },
        ];
      },
      async getBodyHtml() {
        return {
          contentType: 'html',
          content: `<a href="${LINK}">Clique aqui</a>`,
        };
      },
    },
    drive: {
      async uploadPdf() {
        memory.uploads += 1;
        return { itemId: `od-${memory.uploads}` };
      },
    },
    fetch: {
      async fetchHtml() {
        return UNIMED_CG_PAGE_FIXTURE;
      },
      async renderPdf() {
        return Buffer.from('%PDF-1.4 unimed-cg');
      },
    },
    store: memoryStore(),
    deliveryStore: memoryDeliveryStore(),
    whatsapp: null,
    ...overrides,
  };
}

const ENTREGA_SUBJECT = '[ID 81234] [OPME] etapa de autorização concluída';
const ENTREGA_LINK = 'https://unimedcg.opmes.com.br/gestao/www/visualiza-email-processo.php?id=81234';
const ENTREGA_PAGE_FIXTURE = `
<html><body>
<p>Solicitação: 81234</p>
<p>Autorização Principal: 260312345</p>
<p>Situação: Autorizado</p>
<p>Data de Autorização: 12/08/2026</p>
<p>Fornecedores: QL MED COMERCIO DE PRODUTOS HOSPITALARES LTDA</p>
</body></html>
`;


describe('unimed-cg ingest dedup', () => {
  beforeEach(() => {
    resetMemory();
  });

  it('persiste mensagem nova uma vez', async () => {
    const { runUnimedCgIngest } = await import('@/lib/unimed-cg/ingest');
    const result = await runUnimedCgIngest('co1', deps());
    expect(result.processed).toBe(1);
    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.processId).toBe('75576');
    expect(memory.uploads).toBe(1);
  });

  it('dedup por internetMessageId na segunda passagem', async () => {
    const { runUnimedCgIngest } = await import('@/lib/unimed-cg/ingest');
    const d = deps();
    await runUnimedCgIngest('co1', d);
    const second = await runUnimedCgIngest('co1', d);
    expect(second.processed).toBe(0);
    expect(second.skipped).toBeGreaterThan(0);
    expect(memory.uploads).toBe(1);
    expect(memory.authorizations).toHaveLength(1);
  });

  it('dedup por processId: segunda mensagem só grava origem', async () => {
    const { runUnimedCgIngest } = await import('@/lib/unimed-cg/ingest');
    // Uma mensagem por tick (só na 1ª caixa) para isolar processId do fan-out
    // pelas duas caixas UNIMED_CG_MAILBOXES.
    let tick = 0;
    const d = deps({
      mail: {
        async listMessages(mailbox: string) {
          if (!mailbox.startsWith('marcelo@')) return [];
          tick += 1;
          return [
            {
              graphMessageId: `graph-${tick}`,
              internetMessageId: `<msg-${tick}@unimedcg>`,
              subject: SUBJECT,
              receivedAt: new Date(),
              hasAttachments: false,
            },
          ];
        },
        async getBodyHtml() {
          return {
            contentType: 'html',
            content: `<a href="${LINK}">Clique aqui</a>`,
          };
        },
      },
    });
    await runUnimedCgIngest('co1', d);
    const second = await runUnimedCgIngest('co1', d);
    expect(memory.authorizations).toHaveLength(1);
    expect(memory.sources).toHaveLength(2);
    expect(memory.uploads).toBe(1);
    expect(second.processed).toBe(0);
  });

  it('persiste mensagem de entrega uma vez', async () => {
    const { runUnimedCgIngest } = await import('@/lib/unimed-cg/ingest');
    const d = deps({
      mail: {
        async listMessages(mailbox: string) {
          if (!mailbox.startsWith('marcelo@')) return [];
          return [
            {
              graphMessageId: 'graph-e1',
              internetMessageId: '<msg-e1@unimedcg>',
              subject: ENTREGA_SUBJECT,
              receivedAt: new Date(),
              hasAttachments: false,
            },
          ];
        },
        async getBodyHtml() {
          return {
            contentType: 'html',
            content: `<a href="${ENTREGA_LINK}">CLIQUE AQUI</a>`,
          };
        },
      },
      fetch: {
        async fetchHtml() {
          return ENTREGA_PAGE_FIXTURE;
        },
        async renderPdf() {
          return Buffer.from('%PDF-1.4 unimed-cg-entrega');
        },
      },
    });
    const result = await runUnimedCgIngest('co1', d);
    expect(result.processed).toBe(1);
    expect(memory.deliveryAuthorizations).toHaveLength(1);
    expect(memory.deliveryAuthorizations[0]?.processId).toBe('81234');
    expect(memory.authorizations).toHaveLength(0);
    expect(memory.uploads).toBe(1);
  });

  it('não mistura entrega com filtro de faturamento', async () => {
    const { runUnimedCgIngest } = await import('@/lib/unimed-cg/ingest');
    const d = deps({
      mail: {
        async listMessages(mailbox: string) {
          if (!mailbox.startsWith('marcelo@')) return [];
          return [
            {
              graphMessageId: 'graph-mix',
              internetMessageId: '<msg-mix@unimedcg>',
              subject: ENTREGA_SUBJECT,
              receivedAt: new Date(),
              hasAttachments: false,
            },
          ];
        },
        async getBodyHtml() {
          return {
            contentType: 'html',
            content: `<a href="${ENTREGA_LINK}">CLIQUE AQUI</a>`,
          };
        },
      },
      fetch: {
        async fetchHtml() {
          return ENTREGA_PAGE_FIXTURE;
        },
        async renderPdf() {
          return Buffer.from('%PDF-1.4 unimed-cg-entrega');
        },
      },
    });
    await runUnimedCgIngest('co1', d);
    expect(memory.deliveryAuthorizations).toHaveLength(1);
    expect(memory.authorizations).toHaveLength(0);
  });
});
