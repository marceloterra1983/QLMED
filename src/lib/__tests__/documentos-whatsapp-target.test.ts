import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDocumentosWhatsAppTarget } from '@/lib/documentos/alerts';

vi.mock('@/lib/prisma', () => ({ default: {} }));
vi.mock('@/lib/documentos/onedrive-port', () => ({
  createDocumentosFolderPort: vi.fn(),
}));

const CONFIG = { baseUrl: 'https://evolution.qlmed.com.br', instance: 'qlmed', apiKey: 'k' };
const GROUP = '120363024812345678@g.us';

describe('SPEC-042 L7 — resolveDocumentosWhatsAppTarget (G1/G2)', () => {
  beforeEach(() => {
    delete process.env.DOCUMENTOS_WHATSAPP_ENABLED;
    delete process.env.DOCUMENTOS_WHATSAPP_GROUP_JID;
    delete process.env.NOTIFICATION_WHATSAPP_GROUP;
    delete process.env.QLMED_WHATSAPP_GROUP_JID;
  });

  afterEach(() => {
    delete process.env.DOCUMENTOS_WHATSAPP_ENABLED;
    delete process.env.DOCUMENTOS_WHATSAPP_GROUP_JID;
    delete process.env.NOTIFICATION_WHATSAPP_GROUP;
    delete process.env.QLMED_WHATSAPP_GROUP_JID;
  });

  it('sem ENABLED → null', () => {
    process.env.DOCUMENTOS_WHATSAPP_GROUP_JID = GROUP;
    expect(resolveDocumentosWhatsAppTarget(CONFIG)).toBeNull();
  });

  it('sem JID → null', () => {
    process.env.DOCUMENTOS_WHATSAPP_ENABLED = 'true';
    expect(resolveDocumentosWhatsAppTarget(CONFIG)).toBeNull();
  });

  it('JID de telefone → null', () => {
    process.env.DOCUMENTOS_WHATSAPP_ENABLED = 'true';
    process.env.DOCUMENTOS_WHATSAPP_GROUP_JID = '5567999999999';
    expect(resolveDocumentosWhatsAppTarget(CONFIG)).toBeNull();
  });

  it('sem Evolution config → null', () => {
    process.env.DOCUMENTOS_WHATSAPP_ENABLED = 'true';
    process.env.DOCUMENTOS_WHATSAPP_GROUP_JID = GROUP;
    expect(resolveDocumentosWhatsAppTarget(null)).toBeNull();
  });

  it('tudo presente → { jid, port }', () => {
    process.env.DOCUMENTOS_WHATSAPP_ENABLED = 'true';
    process.env.DOCUMENTOS_WHATSAPP_GROUP_JID = GROUP;
    const target = resolveDocumentosWhatsAppTarget(CONFIG);
    expect(target).not.toBeNull();
    expect(target?.jid).toBe(GROUP);
    expect(target?.port.sendDocument).toEqual(expect.any(Function));
  });

  it('sem JID próprio não usa o grupo fiscal', () => {
    process.env.DOCUMENTOS_WHATSAPP_ENABLED = 'true';
    process.env.NOTIFICATION_WHATSAPP_GROUP = GROUP;
    process.env.QLMED_WHATSAPP_GROUP_JID = GROUP;
    expect(resolveDocumentosWhatsAppTarget(CONFIG)).toBeNull();
  });
});
