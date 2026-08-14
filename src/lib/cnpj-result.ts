export interface CnpjResult {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  descSituacao: string | null;
  cnaePrincipal: { codigo: string; descricao: string } | null;
  porte: string | null;
  naturezaJuridica: string | null;
  endereco: {
    logradouro: string | null;
    numero: string | null;
    bairro: string | null;
    municipio: string | null;
    uf: string | null;
    cep: string | null;
  };
  telefone: string | null;
  email: string | null;
  capitalSocial: number | null;
  simplesNacional: boolean | null;
  mei: boolean | null;
}

interface CnpjApiResponse {
  cnpj?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  situacaoCadastral?: string;
  descSituacao?: string;
  cnaePrincipal?: { codigo: string; descricao: string } | null;
  porte?: string;
  naturezaJuridica?: string;
  capitalSocial?: number | null;
  simplesNacional?: boolean | null;
  mei?: boolean | null;
  telefone?: string;
  email?: string;
  endereco?: CnpjResult['endereco'];
}

const EMPTY_ENDERECO: CnpjResult['endereco'] = {
  logradouro: null,
  numero: null,
  bairro: null,
  municipio: null,
  uf: null,
  cep: null,
};

/** Map a CNPJ API response to a normalized CnpjResult. Safe for client bundles. */
export function parseCnpjResponse(data: CnpjApiResponse): CnpjResult {
  return {
    cnpj: data.cnpj ?? '',
    razaoSocial: data.razaoSocial || '',
    nomeFantasia: data.nomeFantasia || null,
    situacaoCadastral: data.situacaoCadastral || data.descSituacao || null,
    descSituacao: data.descSituacao || null,
    cnaePrincipal: data.cnaePrincipal || null,
    porte: data.porte || null,
    naturezaJuridica: data.naturezaJuridica || null,
    capitalSocial: data.capitalSocial ?? null,
    simplesNacional: data.simplesNacional ?? null,
    mei: data.mei ?? null,
    telefone: data.telefone || null,
    email: data.email || null,
    endereco: data.endereco ?? EMPTY_ENDERECO,
  };
}
