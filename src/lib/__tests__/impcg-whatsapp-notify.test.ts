import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImpcgIngestDeps, ImpcgStorePort, PersistArgs } from '@/lib/impcg/ingest';
import {
  buildImpcgWhatsAppCaption,
  isWithinImpcgNotifyWindow,
  resolveImpcgWhatsAppTarget,
} from '@/lib/impcg/whatsapp-notify';

const OFICIO_TEXT = `
ORDEM DE FORNECIMENTO N 17673
DATA: 10/08/2023
PACIENTE: PLINIO ANTONIO ARANHA JUNIOR
MATRICULA: 66429737-4
MEDICO: RODRIGO LUIZ ROCHA CARDOSO
CRM: 13716
PROCEDIMENTO: TROCA VALVAR
LOCAL DE ENTREGA: HOSPITAL PRONCOR
TOTAL GERAL: 12.550,00
`.trim();

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: vi.fn(async () => ({ release: async () => undefined })),
  impcgMailIngestLockKey: (companyId: string) => `impcg-mail-ingest:${companyId}`,
}));

const sent: Array<{ jid: string; caption: string; fileName: string; content: Buffer }> = [];
const marked: Array<{ internetMessageId: string; messageId: string | null }> = [];
const persisted: string[] = [];

function fakeStore(): ImpcgStorePort {
  // As duas caixas de IMPCG_MAILBOXES recebem a mesma mensagem; o store real
  // deduplica pelo unique (companyId, internetMessageId) e o fake precisa fazer
  // o mesmo, senão o teste mede um cenário que não existe em produção.
  const sources = new Set<string>();

  return {
    async findSourceByInternetMessageId(_companyId, internetMessageId) {
      return sources.has(internetMessageId)
        ? { id: 'src-1', authorizationId: 'auth-1', whatsappSentAt: null }
        : null;
    },
    async findByOficioNumber() {
      return null;
    },
    async persistConfirmed(input: PersistArgs) {
      persisted.push(input.oficioNumber);
      if (input.internetMessageId) sources.add(input.internetMessageId);
      return { id: 'auth-1' };
    },
    async persistIssuedAt() {},
    async persistUpgrade() {},
    async persistSourceOnly() {},
    async loadIngestState() {
      return null;
    },
    async saveIngestState() {},
    async markWhatsAppSent(_companyId, internetMessageId, messageId) {
      marked.push({ internetMessageId, messageId });
    },
  };
}

function deps(overrides: Partial<ImpcgIngestDeps> = {}, receivedAt = new Date()): ImpcgIngestDeps {
  return {
    mail: {
      async listMessages() {
        return [
          {
            graphMessageId: 'graph-1',
            internetMessageId: '<msg-1@compras>',
            subject: 'OF 17673',
            receivedAt,
            hasAttachments: true,
          },
        ];
      },
      async getPdfAttachments() {
        return [{ name: 'ordem.pdf', content: Buffer.from('%PDF-1.4 fixture') }];
      },
    },
    drive: { uploadPdf: async () => ({ itemId: 'od-1' }) },
    folder: null,
    extractText: async () => OFICIO_TEXT,
    store: fakeStore(),
    whatsapp: {
      jid: '120363000000000000@g.us',
      port: {
        async sendDocument(input) {
          sent.push(input);
          return { messageId: 'wamid-1' };
        },
      },
    },
    ...overrides,
  };
}

describe('SPEC-031 — aviso do ofício IMPCG no WhatsApp', () => {
  beforeEach(() => {
    sent.length = 0;
    marked.length = 0;
    persisted.length = 0;
    vi.resetModules();
  });

  it('AC-001: mensagem nova envia o PDF do ofício', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    await runImpcgIngest('co1', deps());

    expect(sent).toHaveLength(1);
    expect(sent[0]?.content.toString()).toContain('%PDF');
    expect(sent[0]?.jid).toBe('120363000000000000@g.us');
    expect(marked).toEqual([{ internetMessageId: '<msg-1@compras>', messageId: 'wamid-1' }]);
  });

  it('AC-002: legenda traz ofício, paciente, matrícula, médico e local, sem procedimento', () => {
    const caption = buildImpcgWhatsAppCaption({
      oficioNumber: '17673',
      patientName: 'PLINIO ANTONIO ARANHA JUNIOR',
      patientRegistry: '66429737-4',
      doctorName: 'RODRIGO LUIZ ROCHA CARDOSO',
      doctorCrm: '13716',
      hospitalName: 'HOSPITAL PRONCOR',
    });

    expect(caption).toContain('Ofício 17673');
    expect(caption).toContain('Paciente: PLINIO ANTONIO ARANHA JUNIOR');
    expect(caption).toContain('Matrícula: 66429737-4');
    expect(caption).toContain('Local de entrega: HOSPITAL PRONCOR');
    expect(caption).toContain('CRM 13716');
    // Removido a pedido do dono: o procedimento não pode voltar por acidente.
    expect(caption).not.toContain('Procedimento');
    expect(caption).not.toContain('TROCA VALVAR');
  });

  it('AC-003: local ausente vira "não identificado"', () => {
    const caption = buildImpcgWhatsAppCaption({
      oficioNumber: '17673',
      patientName: 'PACIENTE',
      patientRegistry: null,
      doctorName: null,
      doctorCrm: null,
      hospitalName: null,
    });

    expect(caption).toContain('Local de entrega: não identificado no ofício');
    expect(caption).not.toContain('Matrícula:');
  });

  it('AC-004: mensagem já conhecida não gera segundo envio', async () => {
    const store = fakeStore();
    store.findSourceByInternetMessageId = async () => ({
      id: 'src-1',
      authorizationId: 'auth-1',
      whatsappSentAt: new Date(),
    });

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    await runImpcgIngest('co1', deps({ store }));

    expect(sent).toHaveLength(0);
  });

  it('AC-005: ofício mais antigo que a janela não é avisado', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const oito2018 = new Date('2018-07-24T12:00:00.000Z');
    await runImpcgIngest('co1', deps({}, oito2018));

    expect(persisted).toEqual(['17673']);
    expect(sent).toHaveLength(0);
    expect(isWithinImpcgNotifyWindow(oito2018)).toBe(false);
  });

  it('AC-006: falha do provedor não impede a persistência', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest(
      'co1',
      deps({
        whatsapp: {
          jid: '120363000000000000@g.us',
          port: {
            async sendDocument() {
              throw new Error('Evolution respondeu 500');
            },
          },
        },
      }),
    );

    expect(persisted).toEqual(['17673']);
    expect(result.processed).toBe(1);
    expect(marked).toHaveLength(0);
  });

  it('AC-007: sem configuração não tenta enviar', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    await runImpcgIngest('co1', deps({ whatsapp: null }));

    expect(persisted).toEqual(['17673']);
    expect(sent).toHaveLength(0);
  });

  it('AC-008: destino que não é grupo é recusado', () => {
    const previous = { ...process.env };
    process.env.IMPCG_WHATSAPP_ENABLED = 'true';
    process.env.IMPCG_WHATSAPP_GROUP_JID = '5567999999999';

    expect(
      resolveImpcgWhatsAppTarget({ baseUrl: 'https://evo', instance: 'x', apiKey: 'k' }),
    ).toBeNull();

    process.env = previous;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});
