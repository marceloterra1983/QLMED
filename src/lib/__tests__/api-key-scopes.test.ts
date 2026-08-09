import { describe, expect, it } from 'vitest';
import { API_KEY_SCOPES, normalizeApiKeyScopes } from '../api-key-scopes';

describe('normalizeApiKeyScopes', () => {
  it('trims, drops empties and deduplicates', () => {
    expect(normalizeApiKeyScopes([' invoices:read ', 'invoices:read', '', '  '])).toEqual([
      'invoices:read',
    ]);
  });

  it('preserves order of first appearance', () => {
    expect(normalizeApiKeyScopes(['products:write', 'admin', 'products:write'])).toEqual([
      'products:write',
      'admin',
    ]);
  });
});

describe('API_KEY_SCOPES', () => {
  it('has no duplicates', () => {
    expect(new Set(API_KEY_SCOPES).size).toBe(API_KEY_SCOPES.length);
  });
});
