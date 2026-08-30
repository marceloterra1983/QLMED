/** Autorizador da UF do emitente. QLMED opera em MS; demais UFs usam o mapa oficial 4.00. */

export type SefazEnvironment = 'production' | 'homologation';

const MS = {
  production: {
    autorizacao: 'https://nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4',
    retorno: 'https://nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4',
  },
  homologation: {
    autorizacao: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4',
    retorno: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4',
  },
};

export function nfeAutorizacaoUrls(cUf: string, environment: SefazEnvironment) {
  if (cUf === '50') return MS[environment];
  throw new Error(`Autorizador NF-e ainda não cadastrado para a UF ${cUf}`);
}
