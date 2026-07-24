import { describe, expect, it } from 'vitest';
import {
  allowsApiKeyRequest,
  apiKeyRoleFromScopes,
  hasApiKeyScope,
  isKnownApiKeyScope,
  requiredApiKeyScopeForRequest,
} from '../api-key-scopes';

describe('api key scopes', () => {
  it('maps API routes and methods to resource scopes', () => {
    expect(requiredApiKeyScopeForRequest('GET', '/api/invoices')).toBe('invoices:read');
    expect(requiredApiKeyScopeForRequest('POST', '/api/invoices/upload')).toBe('invoices:write');
    expect(requiredApiKeyScopeForRequest('POST', '/api/invoices/bulk-download')).toBe('invoices:read');
    expect(requiredApiKeyScopeForRequest('GET', '/api/products/list')).toBe('products:read');
    expect(requiredApiKeyScopeForRequest('PATCH', '/api/financeiro/contas-pagar/override')).toBe('financeiro:write');
    expect(requiredApiKeyScopeForRequest('GET', '/api/admin/api-keys')).toBeNull();
    expect(requiredApiKeyScopeForRequest('GET', '/api/nsdocs/config')).toBeNull();
  });

  it('allows write scopes to cover read, but not unrelated resources', () => {
    expect(hasApiKeyScope(['products:write'], 'products:read')).toBe(true);
    expect(hasApiKeyScope(['products:read'], 'products:write')).toBe(false);
    expect(allowsApiKeyRequest(['products:read'], 'GET', '/api/products/list')).toBe(true);
    expect(allowsApiKeyRequest(['products:read'], 'GET', '/api/invoices')).toBe(false);
  });

  it('does not treat legacy role names as functional scopes', () => {
    expect(isKnownApiKeyScope('viewer')).toBe(false);
    expect(allowsApiKeyRequest(['viewer'], 'GET', '/api/invoices')).toBe(false);
    expect(apiKeyRoleFromScopes(['viewer'])).toBe('viewer');
    expect(apiKeyRoleFromScopes(['invoices:write'])).toBe('editor');
  });

  it('keeps explicit integration and admin compatibility', () => {
    expect(allowsApiKeyRequest(['integration'], 'DELETE', '/api/products/rename-type')).toBe(true);
    expect(allowsApiKeyRequest(['integration'], 'GET', '/api/admin/api-keys')).toBe(false);
    expect(allowsApiKeyRequest(['admin'], 'GET', '/api/users')).toBe(false);
    expect(apiKeyRoleFromScopes(['integration'])).toBe('editor');
    expect(apiKeyRoleFromScopes(['admin'])).toBe('admin');
  });
});
