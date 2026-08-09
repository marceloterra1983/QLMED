import { describe, expect, it } from 'vitest';
import {
  normalizePublicBaseUrl,
  resolveNotificationTargetPath,
  sanitizeRedirectPath,
} from '@/lib/notification-clicks';

describe('notification clicks', () => {
  it('resolves the destination page from the invoice type', () => {
    expect(resolveNotificationTargetPath('NFE')).toBe('/fiscal/invoices');
    expect(resolveNotificationTargetPath('CTE')).toBe('/fiscal/cte');
    expect(resolveNotificationTargetPath(null)).toBe('/fiscal/invoices');
  });

  it('keeps redirects local to the QLMED app', () => {
    expect(sanitizeRedirectPath('/fiscal/invoices')).toBe('/fiscal/invoices');
    expect(sanitizeRedirectPath('https://evil.test')).toBe('/fiscal/invoices');
    expect(sanitizeRedirectPath('//evil.test/path')).toBe('/fiscal/invoices');
  });

  it('normalizes the public base URL', () => {
    expect(normalizePublicBaseUrl('https://app.qlmed.com.br/')).toBe('https://app.qlmed.com.br');
  });
});
