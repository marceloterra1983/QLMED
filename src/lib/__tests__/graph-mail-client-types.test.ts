import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRAPH_MAILBOX_TIMEOUT_MS,
  GraphMailboxError,
  listGraphPdfAttachments,
  listImpcgPdfAttachments,
  type GraphMailMessage,
  type GraphPdfAttachment,
  type ImpcgMailMessage,
  type ImpcgPdfAttachment,
} from '@/lib/graph-mail-client';

describe('graph-mail-client types and decoupling', () => {
  it('DEFAULT_GRAPH_MAILBOX_TIMEOUT_MS é 30_000ms por requisição', () => {
    expect(DEFAULT_GRAPH_MAILBOX_TIMEOUT_MS).toBe(30_000);
  });

  it('listImpcgPdfAttachments é alias retrocompatível idêntico a listGraphPdfAttachments', () => {
    expect(listImpcgPdfAttachments).toBe(listGraphPdfAttachments);
  });

  it('GraphMailboxError expõe status e código de erro legíveis', () => {
    const error = new GraphMailboxError('mailbox_forbidden', 403);
    expect(error.name).toBe('GraphMailboxError');
    expect(error.status).toBe(403);
    expect(error.message).toBe('mailbox_forbidden');
  });

  it('tipos genéricos Graph e aliases de operadora são compatíveis', () => {
    const message: GraphMailMessage = {
      graphMessageId: 'id-1',
      internetMessageId: '<msg@operator.com>',
      subject: 'OF 12345',
      receivedAt: new Date(),
      hasAttachments: true,
    };
    const legacyMessage: ImpcgMailMessage = message;
    expect(legacyMessage.graphMessageId).toBe('id-1');

    const attachment: GraphPdfAttachment = {
      name: 'doc.pdf',
      content: Buffer.from('%PDF-1.4'),
    };
    const legacyAttachment: ImpcgPdfAttachment = attachment;
    expect(legacyAttachment.name).toBe('doc.pdf');
  });
});
