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
      { label: 'Visão Geral', path: '/visaogeral' },
    ],
  },
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
      { label: 'NF-e Recebidas', path: '/fiscal/invoices' },
      { label: 'NF-e Emitidas', path: '/fiscal/issued' },
      { label: 'NFS-e Recebidas', path: '/fiscal/nfse-recebidas' },
      { label: 'CT-e', path: '/fiscal/cte' },
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
    section: 'Sistema',
    pages: [
      { label: 'Sincronizar', path: '/sistema/sync' },
      { label: 'Erros', path: '/sistema/errors' },
      { label: 'Upload XML', path: '/sistema/upload' },
      { label: 'Automações', path: '/sistema/automacoes' },
      { label: 'Configurações', path: '/sistema/settings' },
    ],
  },
];

export const ALL_PAGES = PAGE_GROUPS.flatMap((g) => g.pages);

/** Set of valid page paths for backend validation */
export const VALID_PAGE_PATHS = new Set(ALL_PAGES.map((p) => p.path));
