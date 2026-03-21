// Types for the parsed invoice detail responses returned by /api/invoices/[id]/details

// ─── Shared sub-types ────────────────────────────────────────────────────────

export interface EmitDestParty {
  cnpj: string;
  razaoSocial: string;
  fantasia: string;
  ie: string;
  ieSt: string;
  im: string;
  cnae: string;
  crt: string;
  endereco: string;
  bairro: string;
  cep: string;
  municipio: string;
  uf: string;
  pais: string;
  telefone: string;
  email: string;
  indIEDest: string;
  municipioIcms: string;
}

export interface TaxFields {
  cst: string;
  baseCalculo: string;
  aliquota: string;
  valor: string;
  orig?: string;
}

export interface IcmsTaxFields extends TaxFields {
  orig: string;
  baseCalculoSt: string;
  aliquotaSt: string;
  valorSt: string;
}

// ─── NFE types ───────────────────────────────────────────────────────────────

export interface NfeSummaryParty {
  cnpj: string;
  razaoSocial: string;
  ie: string;
  uf: string;
}

export interface NfeInfo {
  modelo: string;
  serie: string;
  numero: string;
  dataEmissao: string;
  dataSaidaEntrada: string;
  valorTotal: string;
  emitente: NfeSummaryParty;
  destinatario: NfeSummaryParty;
  destinoOperacao: string;
  consumidorFinal: string;
  presencaComprador: string;
  processo: string;
  versaoProcesso: string;
  tipoEmissao: string;
  finalidade: string;
  naturezaOperacao: string;
  tipoOperacao: string;
  digestValue: string;
  protocolo: string;
  dataAutorizacao: string;
}

export interface NfeProduto {
  num: string;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
  valorDesconto: string;
  ean: string;
  cest: string;
  icms: IcmsTaxFields;
  ipi: TaxFields;
  pis: TaxFields;
  cofins: TaxFields;
}

export interface NfeTotais {
  baseCalculoIcms: string;
  valorIcms: string;
  icmsDesonerado: string;
  fcp: string;
  fcpSt: string;
  icmsInterestadual: string;
  icmsInterestadualRem: string;
  baseCalculoIcmsSt: string;
  valorIcmsSt: string;
  icmsSubstituicao: string;
  fcpRetidoSt: string;
  fcpRetidoAnteriormenteSt: string;
  valorTotalProdutos: string;
  valorFrete: string;
  valorSeguro: string;
  valorDescontos: string;
  valorII: string;
  valorIpi: string;
  valorIpiDevolvido: string;
  valorPis: string;
  valorCofins: string;
  outrasDespesas: string;
  valorTotalNfe: string;
  valorAproximadoTributos: string;
}

export interface TransporteVolume {
  quantidade: string;
  especie: string;
  marca: string;
  numeracao: string;
  pesoLiquido: string;
  pesoBruto: string;
}

export interface Transportador {
  cnpj: string;
  razaoSocial: string;
  ie: string;
  endereco: string;
  municipio: string;
  uf: string;
}

export interface NfeTransporte {
  modalidadeFrete: string;
  transportador: Transportador;
  volumes: TransporteVolume[];
}

export interface FormaPagamento {
  forma: string;
  valor: string;
  tipoIntegracao: string;
  cnpjCredenciadora: string;
  autorizacao: string;
  troco: string;
  bandeira: string;
}

export interface Fatura {
  numero: string;
  valorOriginal: string;
  valorDesconto: string;
  valorLiquido: string;
}

export interface Duplicata {
  numero: string;
  vencimento: string;
  valor: string;
}

export interface NfeCobranca {
  formasPagamento: FormaPagamento[];
  fatura: Fatura | null;
  duplicatas: Duplicata[];
}

export interface NfeInfAdicionais {
  formatoImpressao: string;
  infFisco: string;
  infComplementar: string;
}

export interface NfeDetails {
  docType: 'NFE';
  accessKey: string;
  number: string;
  series: string;
  nfe: NfeInfo;
  emitente: EmitDestParty | null;
  destinatario: EmitDestParty | null;
  produtos: NfeProduto[];
  totais: NfeTotais;
  transporte: NfeTransporte | null;
  cobranca: NfeCobranca;
  infAdicionais: NfeInfAdicionais;
}

// ─── CTE types ───────────────────────────────────────────────────────────────

export interface CteParty {
  cnpj: string;
  razaoSocial: string;
  fantasia: string;
  ie: string;
  endereco: string;
  bairro: string;
  cep: string;
  municipio: string;
  uf: string;
  pais: string;
  telefone: string;
  email: string;
}

export interface CteInfo {
  modelo: string;
  serie: string;
  numero: string;
  dataEmissao: string;
  cfop: string;
  natOp: string;
  tipoCte: string;
  tipoServico: string;
  modal: string;
  tomador: string;
  municipioOrigem: string;
  ufOrigem: string;
  municipioDestino: string;
  ufDestino: string;
  valorPrestacao: string;
  valorReceber: string;
  protocolo: string;
  dataAutorizacao: string;
}

export interface CargaMedida {
  unidade: string;
  tipoMedida: string;
  quantidade: string;
}

export interface CteCarga {
  valorCarga: string;
  produtoPredominante: string;
  outrCaract: string;
  medidas: CargaMedida[];
}

export interface CteNfeRef {
  chave: string;
}

export interface CteNfRef {
  serie: string;
  numero: string;
  dataEmissao: string;
  valorTotal: string;
}

export interface CteOutroRef {
  tipo: string;
  descricao: string;
  numero: string;
  dataEmissao: string;
  valor: string;
}

export interface CteDocumentos {
  nfeRefs: CteNfeRef[];
  nfRefs: CteNfRef[];
  outrosRefs: CteOutroRef[];
}

export interface CteComponente {
  nome: string;
  valor: string;
}

export interface CteIcms {
  cst: string;
  baseCalculo: string;
  aliquota: string;
  valor: string;
  reducaoBC: string;
  icmsOutraUF: string;
}

export interface CteImpostos {
  icms: CteIcms;
  valorTotalTributos: string;
}

export interface CteSeguro {
  responsavel: string;
  nomeSeguradora: string;
  apolice: string;
}

export interface CteInfAdicionais {
  infAdFisco: string;
  infCpl: string;
}

export interface CteDetails {
  docType: 'CTE';
  accessKey: string;
  number: string;
  series: string;
  cte: CteInfo;
  emitente: CteParty | null;
  remetente: CteParty | null;
  destinatario: CteParty | null;
  expedidor: CteParty | null;
  recebedor: CteParty | null;
  carga: CteCarga;
  documentos: CteDocumentos;
  componentes: CteComponente[];
  impostos: CteImpostos;
  seguro: CteSeguro;
  infAdicionais: CteInfAdicionais;
}

// ─── NFSE types ──────────────────────────────────────────────────────────────

export interface NfseParty {
  cnpj: string;
  razaoSocial: string;
  im: string;
  email: string;
  telefone: string;
  endereco: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
}

export interface NfseInfo {
  numero: string;
  dataEmissao: string;
  dataProcessamento: string;
  codigoVerificacao: string;
  locPrestacao: string;
  valorServico: string;
  valorLiquido: string;
}

export interface NfseServico {
  descricao: string;
  codigoNacional: string;
  codigoMunicipal: string;
  municipio: string;
  issRetido: string;
  baseCalculo: string;
  aliquota: string;
  valorIss: string;
  valorServico: string;
  valorLiquido: string;
}

export interface NfseDetails {
  docType: 'NFSE';
  accessKey: string;
  number: string;
  nfse: NfseInfo;
  prestador: NfseParty;
  tomador: NfseParty;
  servico: NfseServico;
}
