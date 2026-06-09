import { describe, expect, it } from 'vitest';
import {
  buildDeliveryIdempotencyKey,
  buildInvoiceNotificationDestinations,
  buildNotificationEventKey,
  canReceiveInvoiceNotifications,
  getRetryDelaySeconds,
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
});
