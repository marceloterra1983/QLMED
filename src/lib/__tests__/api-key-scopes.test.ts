import { describe, expect, it } from 'vitest';
import { API_KEY_SCOPES, effectiveApiKeyScopes, normalizeApiKeyScopes } from '../api-key-scopes';

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

describe('effectiveApiKeyScopes', () => {
  it('removes the elevated admin scope after creator demotion', () => {
    expect(effectiveApiKeyScopes(['admin', 'invoices:read'], 'editor', 'active')).toEqual([
      'invoices:read',
    ]);
  });

  it('rejects all scopes for an inactive creator', () => {
    expect(effectiveApiKeyScopes(['invoices:read'], 'admin', 'inactive')).toEqual([]);
  });
});
