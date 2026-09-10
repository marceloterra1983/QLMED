import { describe, expect, it, vi } from 'vitest';
import {
  buildDocumentosWhatsAppCaption,
  DOCUMENTOS_WHATSAPP_RECIPIENTS,
  resolveDocumentosWhatsAppPhones,
  shareDocumentByWhatsApp,
  ShareWhatsAppNumberError,
  ShareWhatsAppUnavailableError,
  toDocumentosWhatsAppJid,
} from '@/lib/documentos/share-whatsapp';

describe('toDocumentosWhatsAppJid', () => {
  it('normaliza telefone BR com e sem DDI', () => {
    expect(toDocumentosWhatsAppJid('67 99999-9999')).toBe('5567999999999');
    expect(toDocumentosWhatsAppJid('67999999999')).toBe('5567999999999');
    expect(toDocumentosWhatsAppJid('+55 67 99999-9999')).toBe('5567999999999');
    expect(toDocumentosWhatsAppJid('5567999999999')).toBe('5567999999999');
  });

  it('recusa número inválido', () => {
    expect(toDocumentosWhatsAppJid('abc')).toBeNull();
    expect(toDocumentosWhatsAppJid('123')).toBeNull();
    expect(toDocumentosWhatsAppJid('120363411914746947@g.us')).toBeNull();
  });
});

describe('resolveDocumentosWhatsAppPhones', () => {
  it('aceita allowlist por índice e por número', () => {
    expect(resolveDocumentosWhatsAppPhones(['0'])).toEqual({
      ok: true,
      phones: [DOCUMENTOS_WHATSAPP_RECIPIENTS[0].phone],
    });
    expect(resolveDocumentosWhatsAppPhones([DOCUMENTOS_WHATSAPP_RECIPIENTS[0].phone])).toEqual({
      ok: true,
      phones: [DOCUMENTOS_WHATSAPP_RECIPIENTS[0].phone],
    });
  });

  it('aceita número livre e deduplica pelo JID', () => {
    const free = '67 99999-9999';
    expect(resolveDocumentosWhatsAppPhones([free, '67999999999'])).toEqual({
      ok: true,
      phones: [free],
    });
  });

  it('recusa inválido ou acima do teto', () => {
    expect(resolveDocumentosWhatsAppPhones(['abc'])).toEqual({ ok: false });
    expect(resolveDocumentosWhatsAppPhones([])).toEqual({ ok: false });
    expect(
      resolveDocumentosWhatsAppPhones(Array.from({ length: 11 }, () => '67999999999')),
    ).toEqual({ ok: false });
  });
});

describe('shareDocumentByWhatsApp', () => {
  const pdf = Buffer.from('%PDF-1.7 whatsapp');
  const config = { baseUrl: 'https://evo.example', instance: 'qlmed', apiKey: 'k' };

  it('recusa número inválido sem chamar Evolution', async () => {
    const send = vi.fn();
    await expect(
      shareDocumentByWhatsApp(
        {
          phone: 'abc',
          fileName: 'doc.pdf',
          pdf,
          kindLabel: 'CND Receita Federal',
          validUntil: '2026-12-12',
        },
        { send, config },
      ),
    ).rejects.toBeInstanceOf(ShareWhatsAppNumberError);
    expect(send).not.toHaveBeenCalled();
  });

  it('sem Evolution configurada → unavailable', async () => {
    const send = vi.fn();
    await expect(
      shareDocumentByWhatsApp(
        {
          phone: '67999999999',
          fileName: 'doc.pdf',
          pdf,
          kindLabel: 'CND Receita Federal',
          validUntil: null,
        },
        { send, config: null },
      ),
    ).rejects.toBeInstanceOf(ShareWhatsAppUnavailableError);
    expect(send).not.toHaveBeenCalled();
  });

  it('envia PDF com JID BR normalizado e legenda', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'wa-1' });
    const result = await shareDocumentByWhatsApp(
      {
        phone: '67999999999',
        fileName: 'doc.pdf',
        pdf,
        kindLabel: 'CND Receita Federal',
        validUntil: '2026-12-12',
        note: 'para o processo',
      },
      { send, config },
    );
    expect(result).toEqual({ jid: '5567999999999' });
    expect(send).toHaveBeenCalledWith(
      {
        jid: '5567999999999',
        fileName: 'doc.pdf',
        content: pdf,
        caption: buildDocumentosWhatsAppCaption({
          kindLabel: 'CND Receita Federal',
          validUntil: '2026-12-12',
          note: 'para o processo',
        }),
      },
      config,
    );
  });
});
