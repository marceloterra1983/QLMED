/**
 * CNPJ data parsing utilities.
 *
 * Shared by SupplierDetailsModal and CustomerDetailsModal for normalizing
 * CNPJ API responses into a consistent interface.
 */

export interface CnpjData {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  cnaePrincipal: { codigo: string; descricao: string } | null;
  porte: string | null;
  naturezaJuridica: string | null;
  capitalSocial: number | null;
  simplesNacional: boolean | null;
  mei: boolean | null;
  telefone: string | null;
  email: string | null;
  endereco: {
    logradouro: string | null;
    numero: string | null;
    bairro: string | null;
    municipio: string | null;
    uf: string | null;
    cep: string | null;
  } | null;
}

/** Raw shape from CNPJ API (BrasilAPI / ReceitaWS) before normalization. */
interface CnpjApiResponse {
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
  endereco?: CnpjData['endereco'];
}

/** Map a CNPJ API response to a normalized CnpjData object */
export function parseCnpjResponse(data: CnpjApiResponse): CnpjData {
  return {
    razaoSocial: data.razaoSocial || null,
    nomeFantasia: data.nomeFantasia || null,
    situacaoCadastral: data.situacaoCadastral || data.descSituacao || null,
    cnaePrincipal: data.cnaePrincipal || null,
    porte: data.porte || null,
    naturezaJuridica: data.naturezaJuridica || null,
    capitalSocial: data.capitalSocial ?? null,
    simplesNacional: data.simplesNacional ?? null,
    mei: data.mei ?? null,
    telefone: data.telefone || null,
    email: data.email || null,
    endereco: data.endereco || null,
  };
}
