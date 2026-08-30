export type NfeEndereco = {
  xLgr: string;
  nro: string;
  xCpl?: string;
  xBairro: string;
  cMun: string;
  xMun: string;
  UF: string;
  CEP: string;
};

export type NfeEmitente = {
  cnpj: string;
  xNome: string;
  xFant?: string;
  ie: string;
  crt: string;
  ender: NfeEndereco;
};

export type NfeDestinatario = {
  cnpj: string;
  xNome: string;
  ie?: string | null;
  indIEDest: '1' | '2' | '9';
  ender: NfeEndereco;
  email?: string | null;
};

export type NfeEmissionItem = {
  cProd: string;
  xProd: string;
  ncm: string;
  cfop: string;
  uCom: string;
  qCom: string;
  vUnCom: string;
  vDesc?: string;
  ean?: string | null;
  cest?: string | null;
  anvisa?: string | null;
  orig?: string | null;
  csosn?: string | null;
  cstIcms?: string | null;
  pIcms?: string | null;
  cstPis?: string | null;
  cstCofins?: string | null;
};

export type NfePagamento = {
  indPag: '0' | '1';
  tPag: string;
  vPag?: string;
};

export type NfeTransportadora = {
  cnpj?: string;
  xNome?: string;
  ie?: string;
  xEnder?: string;
  xMun?: string;
  UF?: string;
};

export type NfeVolume = {
  qVol?: string;
  esp?: string;
  marca?: string;
  pesoL?: string;
  pesoB?: string;
};

export type NfeEmissionDraft = {
  natureza: string;
  cfop: string;
  series: string;
  number: string;
  issueDate: Date;
  finNFe: '1' | '2' | '3' | '4';
  indFinal: '0' | '1';
  indPres: string;
  tpAmb: '1' | '2';
  accessKey: string;
  emit: NfeEmitente;
  dest: NfeDestinatario;
  items: NfeEmissionItem[];
  modFrete: string;
  vFrete?: string;
  vSeg?: string;
  vOutro?: string;
  transporta?: NfeTransportadora;
  volume?: NfeVolume;
  pag?: NfePagamento;
  infCpl?: string;
  infAdFisco?: string;
};

export function assertDestinatarioClientePj(cnpj: string, clientes: Iterable<string>): void {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length === 11) {
    throw new Error('Destinatário deve ser cliente pessoa jurídica');
  }
  if (clean.length !== 14) {
    throw new Error('Destinatário deve ter CNPJ válido');
  }
  const allowed = new Set(Array.from(clientes).map((c) => c.replace(/\D/g, '')));
  if (!allowed.has(clean)) {
    throw new Error('Destinatário deve ser cliente cadastrado');
  }
}
