import { describe, expect, it } from 'vitest';
import {
  buildDeliveryIdempotencyKey,
  buildInvoiceNotificationDestinations,
  buildNotificationEventKey,
  canReceiveInvoiceNotifications,
  getConfiguredWhatsAppGroup,
  getRetryDelaySeconds,
  isInvoiceWithinNotificationWindow,
  isNotificationEligibleInvoice,
  normalizeNotificationRecipient,
} from '@/lib/notification-outbox';

describe('notification outbox', () => {
  it('only queues received NF-e and CT-e', () => {
    expect(isNotificationEligibleInvoice({ type: 'NFE', direction: 'received' })).toBe(true);
    expect(isNotificationEligibleInvoice({ type: 'CTE', direction: 'received' })).toBe(true);
    expect(isNotificationEligibleInvoice({ type: 'NFSE', direction: 'received' })).toBe(false);
    expect(isNotificationEligibleInvoice({ type: 'NFE', direction: 'issued' })).toBe(false);
  });

  it('suppresses notifications for stale backlog invoices by issue date', () => {
    const now = new Date('2026-07-01T12:00:00Z');
    const fresh = { issueDate: new Date('2026-06-29T00:00:00Z') };
    const stale = { issueDate: new Date('2026-06-05T00:00:00Z') };

    expect(isInvoiceWithinNotificationWindow(fresh, 5, now)).toBe(true);
    expect(isInvoiceWithinNotificationWindow(stale, 5, now)).toBe(false);
    // 0 desliga a guarda (comportamento anterior: sempre notifica)
    expect(isInvoiceWithinNotificationWindow(stale, 0, now)).toBe(true);
    // sem data de emissão: fail-open, não suprime
    expect(isInvoiceWithinNotificationWindow({ issueDate: null }, 5, now)).toBe(true);
  });

  it('normalizes recipients before deriving a stable delivery key', () => {
    const eventKey = buildNotificationEventKey('invoice-1');
    expect(normalizeNotificationRecipient('email', ' User@QLMED.com.br ')).toBe('user@qlmed.com.br');
    expect(normalizeNotificationRecipient('whatsapp', '+55 (67) 99999-0000')).toBe('5567999990000');
    expect(buildDeliveryIdempotencyKey(eventKey, 'email', 'USER@QLMED.COM.BR'))
      .toBe(buildDeliveryIdempotencyKey(eventKey, 'email', ' user@qlmed.com.br '));
  });

  it('uses bounded exponential retry delays', () => {
    expect(getRetryDelaySeconds(1)).toBe(60);
    expect(getRetryDelaySeconds(3)).toBe(240);
    expect(getRetryDelaySeconds(99)).toBe(21600);
  });

  it('freezes the channel audience using the invoice type rules', () => {
    const users = [
      { email: 'with-phone@qlmed.com.br', phone: '(67) 99999-0000' },
      { email: 'email-only@qlmed.com.br', phone: null },
    ];

    const nfe = buildInvoiceNotificationDestinations('NFE', users, 'faturamento@qlmed.com.br');
    const cte = buildInvoiceNotificationDestinations('CTE', users, 'faturamento@qlmed.com.br');

    expect(nfe).toContainEqual({ channel: 'email', recipient: 'email-only@qlmed.com.br' });
    expect(cte).not.toContainEqual({ channel: 'email', recipient: 'email-only@qlmed.com.br' });
    expect(cte).toContainEqual({ channel: 'whatsapp', recipient: '5567999990000' });
  });

  it('excludes users who cannot access fiscal invoices', () => {
    expect(canReceiveInvoiceNotifications({
      role: 'viewer',
      allowedPages: ['/financeiro/contas-pagar'],
    }, 'NFE')).toBe(false);
    expect(canReceiveInvoiceNotifications({
      role: 'viewer',
      allowedPages: ['/fiscal/cte'],
    }, 'NFE')).toBe(false);
    expect(canReceiveInvoiceNotifications({
      role: 'viewer',
      allowedPages: ['/fiscal/cte'],
    }, 'CTE')).toBe(true);
    expect(canReceiveInvoiceNotifications({
      role: 'admin',
      allowedPages: ['/financeiro/contas-pagar'],
    }, 'NFE')).toBe(true);
  });

  it('normalizes WhatsApp group JID before deriving a stable delivery key', () => {
    const eventKey = buildNotificationEventKey('invoice-group');
    expect(normalizeNotificationRecipient('whatsapp', ' 120363024812345678@g.us '))
      .toBe('120363024812345678@g.us');
    expect(buildDeliveryIdempotencyKey(eventKey, 'whatsapp', '120363024812345678@G.US'))
      .toBe(buildDeliveryIdempotencyKey(eventKey, 'whatsapp', '120363024812345678@g.us'));
    expect(() => normalizeNotificationRecipient('whatsapp', 'grupo-invalido@g.us')).toThrow(
      /group JID/i,
    );
  });

  it('sends WhatsApp once to the configured group and keeps email per user', () => {
    const users = [
      { email: 'with-phone@qlmed.com.br', phone: '(67) 99999-0000' },
      { email: 'other-phone@qlmed.com.br', phone: '67988880000' },
    ];
    const group = '120363024812345678@g.us';

    const nfe = buildInvoiceNotificationDestinations(
      'NFE',
      users,
      'faturamento@qlmed.com.br',
      group,
    );

    const whatsapp = nfe.filter((destination) => destination.channel === 'whatsapp');
    expect(whatsapp).toEqual([{ channel: 'whatsapp', recipient: group }]);
    expect(nfe).toContainEqual({ channel: 'email', recipient: 'with-phone@qlmed.com.br' });
    expect(nfe).toContainEqual({ channel: 'email', recipient: 'other-phone@qlmed.com.br' });
    expect(nfe).toContainEqual({ channel: 'email', recipient: 'faturamento@qlmed.com.br' });
  });

  it('still queues the group WhatsApp when no user is notifiable', () => {
    const destinations = buildInvoiceNotificationDestinations(
      'NFE',
      [],
      'faturamento@qlmed.com.br',
      '120363024812345678@g.us',
    );

    expect(destinations).toEqual([
      { channel: 'email', recipient: 'faturamento@qlmed.com.br' },
      { channel: 'whatsapp', recipient: '120363024812345678@g.us' },
    ]);
  });

  it('ignores a misconfigured group value and keeps personal WhatsApp', () => {
    expect(getConfiguredWhatsAppGroup('')).toBeNull();
    expect(getConfiguredWhatsAppGroup('5567999990000')).toBeNull();
    expect(getConfiguredWhatsAppGroup('not-a-jid')).toBeNull();

    const cte = buildInvoiceNotificationDestinations(
      'CTE',
      [{ email: 'with-phone@qlmed.com.br', phone: '(67) 99999-0000' }],
      'faturamento@qlmed.com.br',
      'not-a-jid',
    );
    expect(cte).toContainEqual({ channel: 'whatsapp', recipient: '5567999990000' });
  });
});
