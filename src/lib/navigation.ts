export interface PageDef {
  label: string;
  path: string;
}

export interface PageGroup {
  section: string;
  pages: PageDef[];
}

export const PAGE_GROUPS: PageGroup[] = [
  {
    section: 'Cadastros',
    pages: [
      { label: 'Produtos', path: '/cadastro/produtos' },
      { label: 'Clientes', path: '/cadastro/clientes' },
      { label: 'Fornecedores', path: '/cadastro/fornecedores' },
      { label: 'Documentos', path: '/cadastro/documentos' },
    ],
  },
  {
    section: 'Fiscal',
    pages: [
      { label: 'Visão Geral', path: '/fiscal/dashboard' },
      { label: 'NF-e Recebidas', path: '/fiscal/invoices' },
      { label: 'NF-e Emitidas', path: '/fiscal/issued' },
      { label: 'NFS-e Recebidas', path: '/fiscal/nfse-recebidas' },
      { label: 'CT-e', path: '/fiscal/cte' },
    ],
  },
  {
    section: 'Estoque',
    pages: [
      { label: 'Entrada NF-e', path: '/estoque/entrada-nfe' },
    ],
  },
  {
    section: 'Financeiro',
    pages: [
      { label: 'Contas a Pagar', path: '/financeiro/contas-pagar' },
      { label: 'Contas a Receber', path: '/financeiro/contas-receber' },
    ],
  },
  {
    section: 'Gestão',
    pages: [
      { label: 'IMPCG', path: '/gestao/impcg' },
      { label: 'CASSEMS', path: '/gestao/cassems' },
    ],
  },
  {
    section: 'Relatórios',
    pages: [
      { label: 'Válvulas Mecânicas Corcym', path: '/relatorios/valvulas-importadas' },
    ],
  },
  {
    section: 'Sistema',
    pages: [
      { label: 'Sincronizar', path: '/sistema/sync' },
      { label: 'Erros', path: '/sistema/errors' },
      { label: 'Upload XML', path: '/sistema/upload' },
      { label: 'Automações', path: '/sistema/automacoes' },
      { label: 'Configurações', path: '/sistema/settings' },
      { label: 'Usuários', path: '/sistema/usuarios' },
    ],
  },
];

export const ALL_PAGES = PAGE_GROUPS.flatMap((g) => g.pages);

/** Set of valid page paths for backend validation */
export const VALID_PAGE_PATHS = new Set(ALL_PAGES.map((p) => p.path));

/**
 * Maps an authenticated UI page path (e.g. /fiscal/dashboard) to the set of
 * API path prefixes that serve that page. Used by middleware to enforce
 * `User.allowedPages` server-side: a non-admin hitting /api/financeiro/...
 * must have /financeiro/contas-pagar OR /financeiro/contas-receber in their
 * allowedPages, otherwise 403.
 *
 * Multiple API prefixes can belong to the same page; an API prefix can also
 * grant access when ANY of several pages is present (e.g. /api/contacts is
 * used by both Clientes and Fornecedores screens).
 */
const API_PREFIX_TO_PAGES: Array<{ prefix: string; pages: string[] }> = [
  // Fiscal
  { prefix: '/api/invoices', pages: ['/fiscal/invoices', '/fiscal/dashboard', '/fiscal/cte', '/fiscal/issued', '/fiscal/nfse-recebidas'] },
  { prefix: '/api/nfe-emissions', pages: ['/fiscal/issued'] },
  { prefix: '/api/fiscal',   pages: ['/fiscal/dashboard', '/fiscal/invoices', '/fiscal/cte', '/fiscal/issued', '/fiscal/nfse-recebidas'] },
  { prefix: '/api/cte',      pages: ['/fiscal/cte'] },
  { prefix: '/api/dashboard',pages: ['/fiscal/dashboard'] },
  // Cadastros
  { prefix: '/api/products',  pages: ['/cadastro/produtos'] },
  { prefix: '/api/ncm',       pages: ['/cadastro/produtos'] },
  { prefix: '/api/anvisa',    pages: ['/cadastro/produtos'] },
  { prefix: '/api/suppliers', pages: ['/cadastro/fornecedores'] },
  { prefix: '/api/customers', pages: ['/cadastro/clientes'] },
  { prefix: '/api/contacts',  pages: ['/cadastro/fornecedores', '/cadastro/clientes'] },
  { prefix: '/api/cnpj',      pages: ['/cadastro/fornecedores', '/cadastro/clientes', '/cadastro/produtos'] },
  { prefix: '/api/documentos', pages: ['/cadastro/documentos'] },
  { prefix: '/api/companies', pages: ['/sistema/settings'] },
  // Estoque
  { prefix: '/api/estoque',   pages: ['/estoque/entrada-nfe'] },
  // Financeiro
  { prefix: '/api/financeiro',pages: ['/financeiro/contas-pagar', '/financeiro/contas-receber'] },
  // Gestão
  { prefix: '/api/gestao/cassems', pages: ['/gestao/cassems'] },
  { prefix: '/api/gestao/impcg',   pages: ['/gestao/impcg'] },
  // Relatórios
  { prefix: '/api/reports',   pages: ['/relatorios/valvulas-importadas'] },
  // Integrações
  { prefix: '/api/integrations', pages: ['/sistema/automacoes'] },
  // Sistema
  { prefix: '/api/users',      pages: ['/sistema/usuarios'] },
  { prefix: '/api/access-log', pages: ['/sistema/usuarios'] },
  { prefix: '/api/nsdocs',     pages: ['/sistema/sync'] },
  { prefix: '/api/receita',    pages: ['/sistema/sync'] },
  { prefix: '/api/certificate',pages: ['/sistema/settings'] },
  { prefix: '/api/onedrive',   pages: ['/sistema/settings'] },
];

/**
 * Panel pages that live under a middleware-matched prefix but are NOT their own
 * entry in PAGE_GROUPS (so they never appear in the sidebar or in the admin's
 * page picker). Each one is gated by the canonical page that owns its data, so
 * an unmapped panel route can no longer skip the allowedPages check entirely.
 */
const PANEL_PAGE_ALIASES: Record<string, string> = {
  '/cadastro/anvisa': '/cadastro/produtos',
  '/sistema/companies': '/sistema/settings',
};

/**
 * APIs every ACTIVE session may call regardless of allowedPages: authentication
 * itself, health, and the caller's own profile. Without the `/api/users/me`
 * exemption a default-deny ACL would stop users from reading or writing their
 * own notification preferences and push subscription, because `/api/users` is
 * gated by the admin-only `/sistema/usuarios` page.
 *
 * Everything NOT listed here and NOT in API_PREFIX_TO_PAGES is denied.
 */
const UNGATED_API_PREFIXES = [
  '/api/auth',
  '/api/health',
  '/api/users/me',
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

/** True when the API is reachable by any active session, ignoring allowedPages. */
export function isUngatedApi(pathname: string): boolean {
  return UNGATED_API_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

/**
 * Returns the allowed pages for a given API pathname.
 * - Empty array = no mapping. Callers must treat that as DENY, not as
 *   "ungated": the ungated set is the explicit UNGATED_API_PREFIXES list.
 * - Non-empty = the user must have AT LEAST ONE of these pages in allowedPages.
 */
export function requiredPagesForApi(pathname: string): string[] {
  for (let i = 0; i < API_PREFIX_TO_PAGES.length; i++) {
    const entry = API_PREFIX_TO_PAGES[i];
    if (matchesPrefix(pathname, entry.prefix)) {
      return entry.pages;
    }
  }
  return [];
}

/**
 * Maps a panel request path to the canonical gated page that governs it, or
 * null when nothing governs it. A null result means DENY for non-admins — the
 * middleware must not fall through to "no check".
 */
export function resolvePanelPagePath(pathname: string): string | null {
  for (const group of PAGE_GROUPS) {
    for (const page of group.pages) {
      if (matchesPrefix(pathname, page.path)) {
        return page.path;
      }
    }
  }
  for (const alias of Object.keys(PANEL_PAGE_ALIASES)) {
    if (matchesPrefix(pathname, alias)) {
      return PANEL_PAGE_ALIASES[alias];
    }
  }
  return null;
}

/**
 * Checks whether an authenticated user is allowed to access a given page path.
 * - admin: always allowed (role bypass)
 * - empty/absent allowedPages: DENY. An empty list is "nothing granted yet",
 *   never "everything granted".
 * - otherwise: pagePath must be literally present in allowedPages
 */
export function canAccessPage(
  role: string | undefined,
  allowedPages: string[] | undefined,
  pagePath: string,
): boolean {
  if (role === 'admin') return true;
  if (!allowedPages || allowedPages.length === 0) return false;
  return allowedPages.includes(pagePath);
}

/**
 * Checks whether an authenticated user is allowed to call a given API pathname.
 * Default-deny: only the explicit ungated list and an explicit page grant pass.
 * An API prefix nobody mapped is denied, so a new route cannot ship open.
 */
export function canAccessApi(
  role: string | undefined,
  allowedPages: string[] | undefined,
  apiPath: string,
): boolean {
  if (role === 'admin') return true;
  if (isUngatedApi(apiPath)) return true;
  const required = requiredPagesForApi(apiPath);
  if (required.length === 0) return false;
  if (!allowedPages || allowedPages.length === 0) return false;
  return required.some((p) => allowedPages.includes(p));
}
