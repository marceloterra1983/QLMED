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
    section: 'Geral',
    pages: [
      { label: 'Visão Geral', path: '/dashboard' },
    ],
  },
  {
    section: 'Cadastros',
    pages: [
      { label: 'Produtos', path: '/dashboard/produtos' },
      { label: 'ANVISA', path: '/dashboard/anvisa' },
      { label: 'Clientes', path: '/dashboard/clientes' },
      { label: 'Fornecedores', path: '/dashboard/fornecedores' },
    ],
  },
  {
    section: 'Fiscal',
    pages: [
      { label: 'NF-e Recebidas', path: '/dashboard/invoices' },
      { label: 'NF-e Emitidas', path: '/dashboard/issued' },
      { label: 'CT-e', path: '/dashboard/cte' },
    ],
  },
  {
    section: 'Financeiro',
    pages: [
      { label: 'Contas a Pagar', path: '/dashboard/contas-pagar' },
      { label: 'Contas a Receber', path: '/dashboard/contas-receber' },
    ],
  },
  {
    section: 'Sistema',
    pages: [
      { label: 'Sincronizar', path: '/dashboard/sync' },
      { label: 'Erros', path: '/dashboard/errors' },
      { label: 'Upload XML', path: '/dashboard/upload' },
      { label: 'Automações', path: '/dashboard/automacoes' },
      { label: 'Configurações', path: '/dashboard/settings' },
    ],
  },
];

export const ALL_PAGES = PAGE_GROUPS.flatMap((g) => g.pages);

/** Set of valid page paths for backend validation */
export const VALID_PAGE_PATHS = new Set(ALL_PAGES.map((p) => p.path));
