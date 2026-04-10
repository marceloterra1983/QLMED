/**
 * Typed interfaces for NFS-e XML documents parsed by fast-xml-parser.
 *
 * Covers both:
 * - ABRASF/municipal format (CompNfse.Nfse.InfNfse)
 * - Nacional ADN format (NFSe.infNFSe)
 *
 * All properties are optional since XML elements may be absent.
 * Leaf values are string | undefined (fast-xml-parser returns strings for text content).
 *
 * Derived from actual usage in:
 * - src/lib/parse-invoice-xml.ts
 */

import type { XmlNode } from './xml-common';

// ── ABRASF Format ──

export interface NFSeValores {
  ValorServicos?: string;
  ValorDeducoes?: string;
  ValorPis?: string;
  ValorCofins?: string;
  ValorInss?: string;
  ValorIr?: string;
  ValorCsll?: string;
  ValorIss?: string;
  IssRetido?: string;
  ValorIssRetido?: string;
  Aliquota?: string;
  BaseCalculo?: string;
  DescontoIncondicionado?: string;
  DescontoCondicionado?: string;
  OutrasRetencoes?: string;
  ValorLiquidoNfse?: string;
}

export interface NFSeServico {
  Valores?: NFSeValores;
  ValorServicos?: string;
  ItemListaServico?: string;
  CodigoCnae?: string;
  CodigoTributacaoMunicipio?: string;
  Discriminacao?: string;
  MunicipioPrestacaoServico?: string;
  CodigoMunicipio?: string;
}

export interface NFSeCpfCnpj {
  Cnpj?: string;
  Cpf?: string;
}

export interface NFSeIdentificacaoPrestador {
  CpfCnpj?: NFSeCpfCnpj;
  Cnpj?: string;
  InscricaoMunicipal?: string;
}

export interface NFSeEnderecoAbrasf {
  Endereco?: string;
  Numero?: string;
  Complemento?: string;
  Bairro?: string;
  CodigoMunicipio?: string;
  Uf?: string;
  Cep?: string;
}

export interface NFSePrestador {
  IdentificacaoPrestador?: NFSeIdentificacaoPrestador;
  RazaoSocial?: string;
  NomeFantasia?: string;
  Endereco?: NFSeEnderecoAbrasf;
  Contato?: XmlNode;
}

export interface NFSeIdentificacaoTomador {
  CpfCnpj?: NFSeCpfCnpj;
  Cnpj?: string;
  InscricaoMunicipal?: string;
}

export interface NFSeTomador {
  IdentificacaoTomador?: NFSeIdentificacaoTomador;
  RazaoSocial?: string;
  NomeFantasia?: string;
  Endereco?: NFSeEnderecoAbrasf;
  Contato?: XmlNode;
}

export interface NFSeInfNfse {
  Numero?: string;
  CodigoVerificacao?: string;
  DataEmissao?: string;
  Servico?: NFSeServico;
  PrestadorServico?: NFSePrestador;
  Prestador?: NFSePrestador;
  TomadorServico?: NFSeTomador;
  Tomador?: NFSeTomador;
  ValoresNfse?: NFSeValores;
}

export interface NFSeNfse {
  InfNfse?: NFSeInfNfse;
}

export interface NFSeCompNfse {
  Nfse?: NFSeNfse;
}

export interface NFSeConsultarResposta {
  ListaNfse?: {
    CompNfse?: NFSeCompNfse;
  };
}

// ── Nacional ADN Format ──

export interface NFSeNacionalValores {
  vLiq?: string;
  vServPrest?: {
    vServ?: string;
    vLiq?: string;
    vServPrest?: string;
  };
}

export interface NFSeNacionalPrest {
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
}

export interface NFSeNacionalToma {
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
}

export interface NFSeNacionalDPS {
  infDPS?: {
    nDPS?: string;
    serie?: string;
    dhEmi?: string;
    Id?: string;
    toma?: NFSeNacionalToma;
    prest?: NFSeNacionalPrest;
    valores?: NFSeNacionalValores;
    [key: string]: unknown;
  };
}

export interface NFSeNacionalInfNFSe {
  nNFSe?: string;
  Id?: string;
  dhProc?: string;
  DPS?: NFSeNacionalDPS;
  emit?: NFSeNacionalPrest;
  valores?: NFSeNacionalValores;
  [key: string]: unknown;
}

// ── Top-level ──

/**
 * Full parsed NFS-e XML result from fast-xml-parser.
 * May contain ABRASF format (CompNfse) or Nacional format (NFSe/infNFSe).
 */
export interface NFSeXml {
  /** ABRASF format */
  CompNfse?: NFSeCompNfse;
  ConsultarNfseResposta?: NFSeConsultarResposta;
  Nfse?: NFSeNfse;
  InfNfse?: NFSeInfNfse;
  /** Nacional ADN format */
  NFSe?: {
    infNFSe?: NFSeNacionalInfNFSe;
  };
  infNFSe?: NFSeNacionalInfNFSe;
}
