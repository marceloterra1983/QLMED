import { describe, expect, it, vi } from 'vitest';
import {
  QLMED_QUOTE_MAILBOXES,
  collectQuoteArchivesFromMail,
  looksLikeQuotePdf,
} from '../orcamentos/archive-import';

describe('arquivo de orçamentos — import Graph @qlmed.com.br', () => {
  it('só aceita as três caixas comerciais da QL MED', () => {
    expect(QLMED_QUOTE_MAILBOXES).toEqual([
      'flavio@qlmed.com.br',
      'daniele@qlmed.com.br',
      'marcelo@qlmed.com.br',
    ]);
  });

  it('reconhece assunto/anexo de orçamento', () => {
    expect(looksLikeQuotePdf('SOL. DE ORÇAMENTO BENEF. LUIZ', 'proposta.pdf')).toBe(true);
    expect(looksLikeQuotePdf('NF-e emitida', 'danfe.pdf')).toBe(false);
  });

  it('grava PDF da caixa Graph e chama o upsert', async () => {
    const writePdf = vi.fn(async () => undefined);
    const upsert = vi.fn(async () => ({ id: 'arc1' }));
    const result = await collectQuoteArchivesFromMail('co1', {
      listMessages: async (mailbox) => [
        {
          graphMessageId: `msg-${mailbox}`,
          internetMessageId: `<${mailbox}>`,
          subject: 'Orçamento paciente X',
          receivedAt: new Date('2026-09-15T12:00:00Z'),
          hasAttachments: true,
        },
      ],
      listAttachments: async () => [{ name: 'orcamento.pdf', content: Buffer.from('%PDF-1.4') }],
      upsert,
      writePdf,
    });
    expect(result.mailboxes).toEqual(QLMED_QUOTE_MAILBOXES);
    expect(result.imported).toBe(3);
    expect(writePdf).toHaveBeenCalledTimes(3);
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(result.mailboxes.every((email) => email.endsWith('@qlmed.com.br'))).toBe(true);
  });
});
