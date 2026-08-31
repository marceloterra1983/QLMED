import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CassemsIngestDeps, CassemsStorePort, PersistArgs } from '@/lib/cassems/ingest';
import {
  buildCassemsWhatsAppCaption,
  isWithinCassemsNotifyWindow,
  resolveCassemsWhatsAppTarget,
} from '@/lib/cassems/whatsapp-notify';
import { OFICIO_2479325231_TEXT } from './cassems-parse-oficio.test';

const SUBJECT = 'Oficio de materiais OPME autorizados 28-08-2026-133128021.pdf';

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: vi.fn(async () => ({ release: async () => undefined })),
  cassemsMailIngestLockKey: (companyId: string) => `cassems-mail-ingest:${companyId}`,
}));

const sent: Array<{ jid: string; caption: string; fileName: string; content: Buffer }> = [];
const marked: Array<{ internetMessageId: string; messageId: string | null }> = [];
const persisted: string[] = [];

function fakeStore(): CassemsStorePort {
  // O store real deduplica pelo unique (companyId, internetMessageId); o fake
  // precisa fazer o mesmo, senão o teste mede um cenário que não existe.
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

function deps(overrides: Partial<CassemsIngestDeps> = {}, receivedAt = new Date()): CassemsIngestDeps {
  return {
    mail: {
      async listMessages() {
        return [
          {
            graphMessageId: 'graph-1',
            internetMessageId: '<msg-1@cassems>',
            subject: SUBJECT,
            receivedAt,
            hasAttachments: true,
          },
        ];
      },
      async getPdfAttachments() {
        return [{ name: 'oficio.pdf', content: Buffer.from('%PDF-1.4 fixture') }];
      },
    },
    drive: { uploadPdf: async () => ({ itemId: 'od-1' }) },
    folder: null,
    extractText: async () => OFICIO_2479325231_TEXT,
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

describe('SPEC-034 — aviso do ofício CASSEMS no WhatsApp', () => {
  beforeEach(() => {
    sent.length = 0;
    marked.length = 0;
    persisted.length = 0;
    vi.resetModules();
  });

  it('AC-001: mensagem nova envia o PDF do ofício', async () => {
    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    await runCassemsIngest('co1', deps());

    expect(sent).toHaveLength(1);
    expect(sent[0]?.content.toString()).toContain('%PDF');
    expect(sent[0]?.jid).toBe('120363000000000000@g.us');
    expect(marked).toEqual([{ internetMessageId: '<msg-1@cassems>', messageId: 'wamid-1' }]);
  });

  it('AC-002: legenda traz ofício, paciente, matrícula, médico e local, sem procedimento', () => {
    const caption = buildCassemsWhatsAppCaption({
      oficioNumber: '2479325231',
      patientName: 'DOUGLAS BARBOSA FELIPE',
      patientRegistry: '0010291552010120',
      doctorName: 'ISMAEL ESCOBAR CAPIATRA',
      doctorCrm: '13716',
      hospitalName: 'HOSPITAL CASSEMS UNIDADE DE CAMPO GRANDE',
    });

    expect(caption).toContain('Autorização CASSEMS — Ofício 2479325231');
    expect(caption).toContain('Paciente: DOUGLAS BARBOSA FELIPE');
    expect(caption).toContain('Matrícula: 0010291552010120');
    expect(caption).toContain('Local de entrega: HOSPITAL CASSEMS UNIDADE DE CAMPO GRANDE');
    expect(caption).toContain('CRM 13716');
    // Removido a pedido do dono: o procedimento não pode voltar por acidente.
    expect(caption).not.toContain('Procedimento');
    expect(caption).not.toMatch(/REVASCULARIZA/i);
  });

  it('AC-003: local ausente vira "não identificado"', () => {
    const caption = buildCassemsWhatsAppCaption({
      oficioNumber: '2479325231',
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

    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    await runCassemsIngest('co1', deps({ store }));

    expect(sent).toHaveLength(0);
  });

  it('AC-005: ofício mais antigo que a janela não é avisado', async () => {
    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    const historico = new Date('2014-02-04T17:01:38.000Z');
    await runCassemsIngest('co1', deps({}, historico));

    expect(persisted).toEqual(['2479325231']);
    expect(sent).toHaveLength(0);
    expect(isWithinCassemsNotifyWindow(historico)).toBe(false);
  });

  it('AC-006: falha do provedor não impede a persistência', async () => {
    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    const result = await runCassemsIngest(
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

    expect(persisted).toEqual(['2479325231']);
    expect(result.processed).toBe(1);
    expect(marked).toHaveLength(0);
  });

  it('AC-007: sem configuração não tenta enviar', async () => {
    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    await runCassemsIngest('co1', deps({ whatsapp: null }));

    expect(persisted).toEqual(['2479325231']);
    expect(sent).toHaveLength(0);
  });

  it('AC-008: destino que não é grupo é recusado', () => {
    const previous = { ...process.env };
    process.env.CASSEMS_WHATSAPP_ENABLED = 'true';
    process.env.CASSEMS_WHATSAPP_GROUP_JID = '5567999999999';

    expect(
      resolveCassemsWhatsAppTarget({ baseUrl: 'https://evo', instance: 'x', apiKey: 'k' }),
    ).toBeNull();

    process.env = previous;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});
