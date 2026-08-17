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
  // Worker de notificações: 'dispatch' cobre claim/ack/submitting do outbox,
  // 'assets' cobre o PDF e o XML da nota que vão anexados na mensagem.
  'notifications:dispatch',
  'notifications:assets',
] as const;

export const API_KEY_REQUEST_PATH_HEADER = 'x-qlmed-request-path';
export const API_KEY_REQUEST_METHOD_HEADER = 'x-qlmed-request-method';

export function normalizeApiKeyScopes(scopes: string[]) {
  return Array.from(new Set(scopes.map((scope) => scope.trim()).filter(Boolean)));
}

export function effectiveApiKeyScopes(
  scopes: string[],
  creatorRole: string,
  creatorStatus: string,
): string[] {
  if (creatorStatus !== 'active') return [];
  if (creatorRole === 'admin') return scopes;
  return scopes.filter((scope) => scope !== 'admin');
}
