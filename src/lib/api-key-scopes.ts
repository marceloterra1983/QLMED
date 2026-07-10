export const API_KEY_SCOPES = [
  'admin',
  'integration',
  'invoices:read',
  'invoices:write',
  'products:read',
  'products:write',
  'financeiro:read',
  'financeiro:write',
  'contacts:read',
  'contacts:write',
  'reports:read',
  'reports:write',
  'sync:read',
  'sync:write',
  'settings:read',
  'settings:write',
  'ncm:read',
  'ncm:write',
  'anvisa:read',
  'anvisa:write',
] as const;

export type ApiKeyScope = typeof API_KEY_SCOPES[number];
export const API_KEY_REQUEST_PATH_HEADER = 'x-qlmed-request-path';
export const API_KEY_REQUEST_METHOD_HEADER = 'x-qlmed-request-method';

const API_KEY_SCOPE_SET = new Set<string>(API_KEY_SCOPES);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isWriteMethod(method: string) {
  return WRITE_METHODS.has(method.toUpperCase());
}

function scopeFor(method: string, readScope: ApiKeyScope, writeScope: ApiKeyScope) {
  return isWriteMethod(method) ? writeScope : readScope;
}

export function isKnownApiKeyScope(scope: string) {
  return API_KEY_SCOPE_SET.has(scope);
}

export function normalizeApiKeyScopes(scopes: string[]) {
  return Array.from(new Set(scopes.map((scope) => scope.trim()).filter(Boolean)));
}

export function hasApiKeyScope(scopes: string[], required: ApiKeyScope) {
  const normalized = new Set(normalizeApiKeyScopes(scopes));
  if (normalized.has('admin')) return true;
  if (normalized.has(required)) return true;

  const [resource, action] = required.split(':');
  if (action === 'read' && normalized.has(`${resource}:write`)) return true;

  return false;
}

export function apiKeyRoleFromScopes(scopes: string[]): 'viewer' | 'editor' | 'admin' {
  const normalized = normalizeApiKeyScopes(scopes);
  if (normalized.includes('admin')) return 'admin';
  if (
    normalized.includes('integration') ||
    normalized.some((scope) => scope.endsWith(':write'))
  ) {
    return 'editor';
  }
  return 'viewer';
}

export function requiredApiKeyScopeForRequest(method: string, pathname: string): ApiKeyScope | null {
  if (pathname.startsWith('/api/admin') || pathname.startsWith('/api/users') || pathname.startsWith('/api/access-log')) return null;
  if (pathname.startsWith('/api/nsdocs/config') || pathname.startsWith('/api/receita/nfse/config')) return null;
  if (pathname.startsWith('/api/onedrive') || pathname.startsWith('/api/certificate') || pathname.startsWith('/api/companies')) return null;

  if (pathname.startsWith('/api/invoices') || pathname.startsWith('/api/cte')) {
    if (pathname.startsWith('/api/invoices/bulk-download') || pathname.startsWith('/api/invoices/export-xml')) return 'invoices:read';
    return scopeFor(method, 'invoices:read', 'invoices:write');
  }
  if (pathname.startsWith('/api/products')) {
    return scopeFor(method, 'products:read', 'products:write');
  }
  if (pathname.startsWith('/api/financeiro')) {
    return scopeFor(method, 'financeiro:read', 'financeiro:write');
  }
  if (
    pathname.startsWith('/api/contacts') ||
    pathname.startsWith('/api/customers') ||
    pathname.startsWith('/api/suppliers') ||
    pathname.startsWith('/api/cnpj')
  ) {
    return scopeFor(method, 'contacts:read', 'contacts:write');
  }
  if (pathname.startsWith('/api/reports') || pathname.startsWith('/api/dashboard') || pathname.startsWith('/api/fiscal')) {
    return scopeFor(method, 'reports:read', 'reports:write');
  }
  if (pathname.startsWith('/api/nsdocs') || pathname.startsWith('/api/receita')) {
    return scopeFor(method, 'sync:read', 'sync:write');
  }
  if (pathname.startsWith('/api/ncm')) {
    return scopeFor(method, 'ncm:read', 'ncm:write');
  }
  if (pathname.startsWith('/api/anvisa')) {
    return scopeFor(method, 'anvisa:read', 'anvisa:write');
  }
  if (pathname.startsWith('/api/estoque')) {
    return scopeFor(method, 'invoices:read', 'invoices:write');
  }

  return null;
}

export function allowsApiKeyRequest(scopes: string[], method: string, pathname: string) {
  const normalized = normalizeApiKeyScopes(scopes);
  const required = requiredApiKeyScopeForRequest(method, pathname);
  if (!required) return false;
  if (normalized.includes('integration')) return true;
  return hasApiKeyScope(normalized, required);
}
