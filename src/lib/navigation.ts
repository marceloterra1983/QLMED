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
      { label: 'ANVISA', path: '/cadastro/anvisa' },
      { label: 'Clientes', path: '/cadastro/clientes' },
      { label: 'Fornecedores', path: '/cadastro/fornecedores' },
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
  { prefix: '/api/fiscal',   pages: ['/fiscal/dashboard', '/fiscal/invoices', '/fiscal/cte', '/fiscal/issued', '/fiscal/nfse-recebidas'] },
  { prefix: '/api/cte',      pages: ['/fiscal/cte'] },
  { prefix: '/api/dashboard',pages: ['/fiscal/dashboard'] },
  // Cadastros
  { prefix: '/api/products',  pages: ['/cadastro/produtos'] },
  { prefix: '/api/ncm',       pages: ['/cadastro/produtos'] },
  { prefix: '/api/anvisa',    pages: ['/cadastro/anvisa'] },
  { prefix: '/api/suppliers', pages: ['/cadastro/fornecedores'] },
  { prefix: '/api/customers', pages: ['/cadastro/clientes'] },
  { prefix: '/api/contacts',  pages: ['/cadastro/fornecedores', '/cadastro/clientes'] },
  { prefix: '/api/cnpj',      pages: ['/cadastro/fornecedores', '/cadastro/clientes', '/cadastro/produtos'] },
  { prefix: '/api/companies', pages: ['/sistema/settings'] },
  // Estoque
  { prefix: '/api/estoque',   pages: ['/estoque/entrada-nfe'] },
  // Financeiro
  { prefix: '/api/financeiro',pages: ['/financeiro/contas-pagar', '/financeiro/contas-receber'] },
  // Relatórios
  { prefix: '/api/reports',   pages: ['/relatorios/valvulas-importadas'] },
  // Sistema
  { prefix: '/api/users',      pages: ['/sistema/usuarios'] },
  { prefix: '/api/access-log', pages: ['/sistema/usuarios'] },
  { prefix: '/api/nsdocs',     pages: ['/sistema/sync'] },
  { prefix: '/api/receita',    pages: ['/sistema/sync'] },
  { prefix: '/api/certificate',pages: ['/sistema/settings'] },
  { prefix: '/api/onedrive',   pages: ['/sistema/settings'] },
];

/**
 * Returns the allowed pages for a given API pathname.
 * - Empty array = this API is not page-gated (public auth, webhooks, health).
 * - Non-empty = the user must have AT LEAST ONE of these pages in allowedPages.
 */
export function requiredPagesForApi(pathname: string): string[] {
  for (let i = 0; i < API_PREFIX_TO_PAGES.length; i++) {
    const entry = API_PREFIX_TO_PAGES[i];
    if (pathname === entry.prefix || pathname.startsWith(entry.prefix + '/')) {
      return entry.pages;
    }
  }
  return [];
}

/**
 * Checks whether an authenticated user is allowed to access a given page path.
 * - admin: always allowed (role bypass)
 * - empty allowedPages: legacy users with no explicit list get full access
 * - otherwise: pagePath must be literally present in allowedPages
 */
export function canAccessPage(
  role: string | undefined,
  allowedPages: string[] | undefined,
  pagePath: string,
): boolean {
  if (role === 'admin') return true;
  if (!allowedPages || allowedPages.length === 0) return true;
  return allowedPages.includes(pagePath);
}

/**
 * Checks whether an authenticated user is allowed to call a given API pathname.
 * Returns true if the API is not page-gated, OR if the user has any one of the
 * permitted page paths in their allowedPages list.
 */
export function canAccessApi(
  role: string | undefined,
  allowedPages: string[] | undefined,
  apiPath: string,
): boolean {
  if (role === 'admin') return true;
  const required = requiredPagesForApi(apiPath);
  if (required.length === 0) return true;
  if (!allowedPages || allowedPages.length === 0) return true;
  return required.some((p) => allowedPages.includes(p));
}
