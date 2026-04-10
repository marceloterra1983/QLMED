import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { val } from '@/lib/xml-helpers';
import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import type { XmlNode } from '@/types/xml-common';
import type { NFeInfNFe, NFeDet, NFeImposto, NFeTaxGroup } from '@/types/nfe-xml';
import type { CTeInfCte, CTeProc, CTeInfQ, CTeInfNFe as CTeDocNFe, CTeComp } from '@/types/cte-xml';
import type { NFSeNacionalInfNFSe, NFSeInfNfse } from '@/types/nfse-xml';

const log = createLogger('invoices/:id/details');

function parseEmitDest(node: XmlNode | null | undefined) {
  if (!node) return null;
  const ender = (node.enderEmit || node.enderDest || {}) as XmlNode;
  return {
    cnpj: val(node, 'CNPJ', 'CPF'),
    razaoSocial: val(node, 'xNome'),
    fantasia: val(node, 'xFant'),
    ie: val(node, 'IE'),
    ieSt: val(node, 'IEST'),
    im: val(node, 'IM'),
    cnae: val(node, 'CNAE'),
    crt: val(node, 'CRT'),
    endereco: [val(ender, 'xLgr'), val(ender, 'nro'), val(ender, 'xCpl')].filter(Boolean).join(', '),
    bairro: val(ender, 'xBairro'),
    cep: val(ender, 'CEP'),
    municipio: [val(ender, 'cMun'), val(ender, 'xMun')].filter(Boolean).join(' - '),
    uf: val(ender, 'UF'),
    pais: val(ender, 'xPais') || 'BRASIL',
    telefone: val(ender, 'fone'),
    email: val(node, 'email'),
    indIEDest: val(node, 'indIEDest'),
    municipioIcms: val(node, 'cMunFG') || val(ender, 'cMun'),
  };
}

function parseProdutos(det: NFeDet | NFeDet[] | undefined) {
  if (!det) return [];
  const items: NFeDet[] = Array.isArray(det) ? det : [det];
  return items.map((item, idx: number) => {
    const prod = (item.prod || {}) as XmlNode;
    const imposto = item.imposto || ({} as NFeImposto);
    const icms = imposto.ICMS ? Object.values(imposto.ICMS)[0] as NFeTaxGroup : ({} as XmlNode);
    const ipi = imposto.IPI;
    const ipiTrib = (ipi?.IPITrib || ipi?.IPINT || {}) as XmlNode;
    const pis = imposto.PIS ? Object.values(imposto.PIS)[0] as NFeTaxGroup : ({} as XmlNode);
    const cofins = imposto.COFINS ? Object.values(imposto.COFINS)[0] as NFeTaxGroup : ({} as XmlNode);

    return {
      num: item.nItem || String(idx + 1),
      codigo: val(prod, 'cProd'),
      descricao: val(prod, 'xProd'),
      ncm: val(prod, 'NCM'),
      cfop: val(prod, 'CFOP'),
      unidade: val(prod, 'uCom'),
      quantidade: val(prod, 'qCom'),
      valorUnitario: val(prod, 'vUnCom'),
      valorTotal: val(prod, 'vProd'),
      valorDesconto: val(prod, 'vDesc'),
      ean: val(prod, 'cEAN'),
      cest: val(prod, 'CEST'),
      icms: {
        orig: val(icms, 'orig'),
        cst: val(icms, 'CST', 'CSOSN'),
        baseCalculo: val(icms, 'vBC'),
        aliquota: val(icms, 'pICMS'),
        valor: val(icms, 'vICMS'),
        baseCalculoSt: val(icms, 'vBCST'),
        aliquotaSt: val(icms, 'pICMSST'),
        valorSt: val(icms, 'vICMSST'),
      },
      ipi: {
        cst: val(ipiTrib, 'CST'),
        baseCalculo: val(ipiTrib, 'vBC'),
        aliquota: val(ipiTrib, 'pIPI'),
        valor: val(ipiTrib, 'vIPI'),
      },
      pis: {
        cst: val(pis, 'CST'),
        baseCalculo: val(pis, 'vBC'),
        aliquota: val(pis, 'pPIS'),
        valor: val(pis, 'vPIS'),
      },
      cofins: {
        cst: val(cofins, 'CST'),
        baseCalculo: val(cofins, 'vBC'),
        aliquota: val(cofins, 'pCOFINS'),
        valor: val(cofins, 'vCOFINS'),
      },
    };
  });
}

function parseTotais(total: XmlNode) {
  const t = total?.ICMSTot || {};
  return {
    baseCalculoIcms: val(t, 'vBC'),
    valorIcms: val(t, 'vICMS'),
    icmsDesonerado: val(t, 'vICMSDeson'),
    fcp: val(t, 'vFCPUFDest') || val(t, 'vFCP'),
    fcpSt: val(t, 'vFCPST'),
    icmsInterestadual: val(t, 'vICMSUFDest'),
    icmsInterestadualRem: val(t, 'vICMSUFRemet'),
    baseCalculoIcmsSt: val(t, 'vBCST'),
    valorIcmsSt: val(t, 'vST'),
    icmsSubstituicao: val(t, 'vICMSSub') || val(t, 'vST'),
    fcpRetidoSt: val(t, 'vFCPSTRet'),
    fcpRetidoAnteriormenteSt: val(t, 'vFCPSTRet'),
    valorTotalProdutos: val(t, 'vProd'),
    valorFrete: val(t, 'vFrete'),
    valorSeguro: val(t, 'vSeg'),
    valorDescontos: val(t, 'vDesc'),
    valorII: val(t, 'vII'),
    valorIpi: val(t, 'vIPI'),
    valorIpiDevolvido: val(t, 'vIPIDevol'),
    valorPis: val(t, 'vPIS'),
    valorCofins: val(t, 'vCOFINS'),
    outrasDespesas: val(t, 'vOutro'),
    valorTotalNfe: val(t, 'vNF'),
    valorAproximadoTributos: val(t, 'vTotTrib'),
  };
}

function parseTransporte(transp: XmlNode | null | undefined) {
  if (!transp) return null;
  const transporta = (transp.transporta || {}) as XmlNode;
  const vol = transp.vol;
  const volumes: XmlNode[] = vol ? (Array.isArray(vol) ? vol : [vol]) as XmlNode[] : [];

  const modFreteMap: Record<string, string> = {
    '0': '0 - Contratação do Frete por conta do Remetente (CIF)',
    '1': '1 - Contratação do Frete por conta do Destinatário/Remetente',
    '2': '2 - Contratação do Frete por conta de Terceiros',
    '3': '3 - Transporte Próprio por conta do Remetente',
    '4': '4 - Transporte Próprio por conta do Destinatário',
    '9': '9 - Sem Ocorrência de Transporte',
  };

  return {
    modalidadeFrete: modFreteMap[transp.modFrete as string] || (transp.modFrete as string) || '',
    transportador: {
      cnpj: val(transporta, 'CNPJ', 'CPF'),
      razaoSocial: val(transporta, 'xNome'),
      ie: val(transporta, 'IE'),
      endereco: val(transporta, 'xEnder'),
      municipio: val(transporta, 'xMun'),
      uf: val(transporta, 'UF'),
    },
    volumes: volumes.map((v) => ({
      quantidade: val(v, 'qVol'),
      especie: val(v, 'esp'),
      marca: val(v, 'marca'),
      numeracao: val(v, 'nVol'),
      pesoLiquido: val(v, 'pesoL'),
      pesoBruto: val(v, 'pesoB'),
    })),
  };
}

function parseCobranca(cobr: XmlNode | null | undefined, pag: XmlNode | null | undefined) {
  const pagItems = pag?.detPag;
  const pagList: XmlNode[] = pagItems ? (Array.isArray(pagItems) ? pagItems : [pagItems]) as XmlNode[] : [];

  const tPagMap: Record<string, string> = {
    '01': '01 - Dinheiro', '02': '02 - Cheque', '03': '03 - Cartão de Crédito',
    '04': '04 - Cartão de Débito', '05': '05 - Crédito Loja',
    '10': '10 - Vale Alimentação', '11': '11 - Vale Refeição',
    '12': '12 - Vale Presente', '13': '13 - Vale Combustível',
    '14': '14 - Duplicata Mercantil', '15': '15 - Boleto Bancário',
    '16': '16 - Depósito Bancário', '17': '17 - PIX',
    '90': '90 - Sem Pagamento', '99': '99 - Outros',
  };

  const formasPagamento = pagList.map((p) => ({
    forma: tPagMap[val(p, 'tPag')] || val(p, 'tPag'),
    valor: val(p, 'vPag'),
    tipoIntegracao: val(p, 'tpIntegra'),
    cnpjCredenciadora: val(p, 'CNPJ'),
    autorizacao: val(p, 'cAut'),
    troco: val(pag, 'vTroco') || '0,00',
    bandeira: val(p, 'tBand'),
  }));

  const fat = cobr?.fat;
  const fatura = fat ? {
    numero: val(fat, 'nFat'),
    valorOriginal: val(fat, 'vOrig'),
    valorDesconto: val(fat, 'vDesc'),
    valorLiquido: val(fat, 'vLiq'),
  } : null;

  const dupItems = cobr?.dup;
  const dupList: XmlNode[] = dupItems ? (Array.isArray(dupItems) ? dupItems : [dupItems]) as XmlNode[] : [];
  const duplicatas = dupList.map((d) => ({
    numero: val(d, 'nDup'),
    vencimento: val(d, 'dVenc'),
    valor: val(d, 'vDup'),
  }));

  return { formasPagamento, fatura, duplicatas };
}

function parseInfAdicionais(infAdFisco: string | undefined, infCpl: string | undefined, ide: XmlNode) {
  const tpImpMap: Record<string, string> = {
    '1': '1 - DANFE normal, Retrato',
    '2': '2 - DANFE normal, Paisagem',
    '3': '3 - DANFE Simplificado',
    '4': '4 - DANFE NFC-e',
    '5': '5 - DANFE NFC-e em mensagem eletrônica',
  };
  return {
    formatoImpressao: tpImpMap[ide?.tpImp as string] || (ide?.tpImp as string) || '',
    infFisco: infAdFisco || '',
    infComplementar: infCpl || '',
  };
}

function parseCteParty(node: XmlNode | null | undefined) {
  if (!node) return null;
  const ender = (node.enderReme || node.enderDest || node.enderExped || node.enderReceb || node.enderToma || {}) as XmlNode;
  return {
    cnpj: val(node, 'CNPJ', 'CPF'),
    razaoSocial: val(node, 'xNome'),
    fantasia: val(node, 'xFant'),
    ie: val(node, 'IE'),
    endereco: [val(ender, 'xLgr'), val(ender, 'nro'), val(ender, 'xCpl')].filter(Boolean).join(', '),
    bairro: val(ender, 'xBairro'),
    cep: val(ender, 'CEP'),
    municipio: [val(ender, 'cMun'), val(ender, 'xMun')].filter(Boolean).join(' - '),
    uf: val(ender, 'UF'),
    pais: val(ender, 'xPais') || 'BRASIL',
    telefone: val(node, 'fone') || val(ender, 'fone'),
    email: val(node, 'email'),
  };
}

function parseCteDetails(
  invoice: { accessKey: string | null; number: string; series: string | null },
  infCte: CTeInfCte,
  cteProc: XmlNode,
) {
  const ide = (infCte.ide || {}) as XmlNode;
  const emit = (infCte.emit || {}) as XmlNode;
  const rem = (infCte.rem || {}) as XmlNode;
  const dest = (infCte.dest || {}) as XmlNode;
  const exped = (infCte.exped || {}) as XmlNode;
  const receb = (infCte.receb || {}) as XmlNode;
  const vPrest = infCte.vPrest || {};
  const infCteNorm = infCte.infCteNorm || infCte.infCTeNorm || {};
  const infCarga = infCteNorm.infCarga || {};
  const infDoc = infCteNorm.infDoc || {};
  const seg = (infCteNorm as XmlNode).seg as XmlNode | undefined ?? {};
  const imp = (infCte.imp || {}) as XmlNode;
  const infAdic = (infCte as XmlNode).infAdic as XmlNode | undefined ?? {};

  const protCTe = ((cteProc?.protCTe as XmlNode)?.infProt || {}) as XmlNode;

  // Tomador resolution
  const tomaMap: Record<string, string> = {
    '0': 'Remetente', '1': 'Expedidor', '2': 'Recebedor', '3': 'Destinatário', '4': 'Outros',
  };
  const tomaCode = val(ide, 'toma3', 'toma4') ? val((ide.toma3 || ide.toma4 || {}) as XmlNode, 'toma') : '';

  // Modal
  const modalMap: Record<string, string> = {
    '01': 'Rodoviário', '02': 'Aéreo', '03': 'Aquaviário', '04': 'Ferroviário', '05': 'Dutoviário', '06': 'Multimodal',
  };

  // Tipo CT-e
  const tpCTeMap: Record<string, string> = {
    '0': '0 - CT-e Normal', '1': '1 - CT-e de Complemento de Valores',
    '2': '2 - CT-e de Anulação', '3': '3 - CT-e Substituto',
  };

  // Tipo Serviço
  const tpServMap: Record<string, string> = {
    '0': '0 - Normal', '1': '1 - Subcontratação', '2': '2 - Redespacho',
    '3': '3 - Redespacho Intermediário', '4': '4 - Serviço Vinculado a Multimodal',
  };

  // ICMS do CT-e
  const icmsNode = imp.ICMS ? Object.values(imp.ICMS as Record<string, unknown>)[0] as XmlNode : ({} as XmlNode);

  // NF-e referenciadas
  const infNFeItems = infDoc.infNFe;
  const nfeRefs: XmlNode[] = infNFeItems ? (Array.isArray(infNFeItems) ? infNFeItems : [infNFeItems]) as XmlNode[] : [];
  const infNFItems = infDoc.infNF;
  const nfRefs: XmlNode[] = infNFItems ? (Array.isArray(infNFItems) ? infNFItems : [infNFItems]) as XmlNode[] : [];
  const infOutrosItems = infDoc.infOutros;
  const outrosRefs: XmlNode[] = infOutrosItems ? (Array.isArray(infOutrosItems) ? infOutrosItems : [infOutrosItems]) as XmlNode[] : [];

  // Componentes de valor
  const compItems = vPrest.Comp;
  const componentes: XmlNode[] = compItems ? (Array.isArray(compItems) ? compItems : [compItems]) as XmlNode[] : [];

  // Medidas da carga
  const infQItems = infCarga.infQ;
  const medidas: XmlNode[] = infQItems ? (Array.isArray(infQItems) ? infQItems : [infQItems]) as XmlNode[] : [];

  const cUnidMap: Record<string, string> = {
    '00': 'M3', '01': 'KG', '02': 'TON', '03': 'UN', '04': 'LT', '05': 'MMBTU',
  };

  return {
    docType: 'CTE' as const,
    accessKey: invoice.accessKey,
    number: invoice.number,
    series: invoice.series || '',
    cte: {
      modelo: val(ide, 'mod'),
      serie: val(ide, 'serie'),
      numero: val(ide, 'nCT'),
      dataEmissao: val(ide, 'dhEmi'),
      cfop: val(ide, 'CFOP'),
      natOp: val(ide, 'natOp'),
      tipoCte: tpCTeMap[ide.tpCTe as string] || val(ide, 'tpCTe'),
      tipoServico: tpServMap[ide.tpServ as string] || val(ide, 'tpServ'),
      modal: modalMap[ide.modal as string] || val(ide, 'modal'),
      tomador: tomaMap[tomaCode] || tomaCode,
      municipioOrigem: [val(ide, 'cMunIni'), val(ide, 'xMunIni')].filter(Boolean).join(' - '),
      ufOrigem: val(ide, 'UFIni'),
      municipioDestino: [val(ide, 'cMunFim'), val(ide, 'xMunFim')].filter(Boolean).join(' - '),
      ufDestino: val(ide, 'UFFim'),
      valorPrestacao: val(vPrest, 'vTPrest'),
      valorReceber: val(vPrest, 'vRec'),
      protocolo: val(protCTe, 'nProt'),
      dataAutorizacao: val(protCTe, 'dhRecbto'),
    },
    emitente: parseCteParty(emit),
    remetente: parseCteParty(rem),
    destinatario: parseCteParty(dest),
    expedidor: parseCteParty(exped),
    recebedor: parseCteParty(receb),
    carga: {
      valorCarga: val(infCarga, 'vCarga'),
      produtoPredominante: val(infCarga, 'proPred'),
      outrCaract: val(infCarga, 'xOutCat'),
      medidas: medidas.map((q) => ({
        unidade: cUnidMap[val(q, 'cUnid')] || val(q, 'cUnid'),
        tipoMedida: val(q, 'tpMed'),
        quantidade: val(q, 'qCarga'),
      })),
    },
    documentos: {
      nfeRefs: nfeRefs.map((n) => ({
        chave: val(n, 'chave'),
      })),
      nfRefs: nfRefs.map((n) => ({
        serie: val(n, 'serie'),
        numero: val(n, 'nDoc'),
        dataEmissao: val(n, 'dEmi'),
        valorTotal: val(n, 'vBC'),
      })),
      outrosRefs: outrosRefs.map((o) => ({
        tipo: val(o, 'tpDoc'),
        descricao: val(o, 'descOutros'),
        numero: val(o, 'nDoc'),
        dataEmissao: val(o, 'dEmi'),
        valor: val(o, 'vDocFisc'),
      })),
    },
    componentes: componentes.map((c) => ({
      nome: val(c, 'xNome'),
      valor: val(c, 'vComp'),
    })),
    impostos: {
      icms: {
        cst: val(icmsNode, 'CST'),
        baseCalculo: val(icmsNode, 'vBC'),
        aliquota: val(icmsNode, 'pICMS'),
        valor: val(icmsNode, 'vICMS'),
        reducaoBC: val(icmsNode, 'pRedBC'),
        icmsOutraUF: val(icmsNode, 'vICMSOutraUF'),
      },
      valorTotalTributos: val(imp, 'vTotTrib') || val(infCte, 'vTotTrib'),
    },
    seguro: {
      responsavel: val(seg, 'respSeg'),
      nomeSeguradora: val(seg, 'xSeg'),
      apolice: val(seg, 'nApol'),
    },
    infAdicionais: {
      infAdFisco: val(infAdic, 'infAdFisco'),
      infCpl: val(infAdic, 'infCpl'),
    },
  };
}

function parseNfseParty(node: XmlNode | null | undefined, enderKey?: string) {
  if (!node) return null;
  const ender = (node[enderKey || 'Endereco'] || node.endereco || {}) as XmlNode;
  const idNode = (node.IdentificacaoPrestador || node.IdentificacaoTomador || {}) as XmlNode;
  const cnpjNode = (idNode.CpfCnpj || idNode) as XmlNode;
  return {
    cnpj: val(node, 'CNPJ', 'CPF') || val(cnpjNode, 'Cnpj', 'Cpf') || '',
    razaoSocial: val(node, 'RazaoSocial', 'NomeFantasia', 'xNome') || '',
    im: val(node, 'InscricaoMunicipal') || val(idNode, 'InscricaoMunicipal') || '',
    email: val(node, 'Contato', 'email') || '',
    telefone: val(node, 'fone') || '',
    endereco: [val(ender, 'Logradouro', 'xLgr'), val(ender, 'Numero', 'nro'), val(ender, 'Complemento', 'xCpl')].filter(Boolean).join(', '),
    bairro: val(ender, 'Bairro', 'xBairro') || '',
    municipio: val(ender, 'Municipio', 'xMun') || '',
    uf: val(ender, 'Uf', 'UF') || '',
    cep: val(ender, 'Cep', 'CEP') || '',
  };
}

function parseNfseDetails(
  invoice: { accessKey: string | null; number: string },
  nacional: NFSeNacionalInfNFSe | undefined,
  abrasf: NFSeInfNfse | undefined,
) {
  if (nacional) {
    const dps = (nacional.DPS?.infDPS || {}) as XmlNode;
    const prest = (dps.prest || nacional.emit || {}) as XmlNode;
    const toma = (dps.toma || {}) as XmlNode;
    const serv = (dps.serv || {}) as XmlNode;
    const cServ = (serv.cServ || {}) as XmlNode;
    const locPrest = (serv.locPrest || {}) as XmlNode;
    const valores = (dps.valores || {}) as XmlNode;
    const vServPrest = (valores.vServPrest || {}) as XmlNode;
    const trib = (valores.trib || {}) as XmlNode;
    const issqn = ((trib.tribMun as XmlNode)?.ISSQN || {}) as XmlNode;
    const nfseProc = (nacional as XmlNode).nfseProc as XmlNode | undefined ?? ({} as XmlNode);

    const tpRetMap: Record<string, string> = { '1': 'Sim', '2': 'Não', '3': 'Imune', '4': 'Exigibilidade Suspensa' };

    return {
      docType: 'NFSE' as const,
      accessKey: invoice.accessKey,
      number: invoice.number,
      nfse: {
        numero: String(nacional.nNFSe || dps.nDPS || invoice.number || ''),
        dataEmissao: val(dps, 'dhEmi') || val(nacional as XmlNode, 'dhProc') || '',
        dataProcessamento: val(nfseProc, 'dhProc') || '',
        codigoVerificacao: val(nacional as XmlNode, 'codVerif', 'CodigoVerificacao') || '',
        locPrestacao: val(locPrest, 'xLocPrestacao', 'cLocPrestacao') || '',
        valorLiquido: val(vServPrest, 'vLiq') || val(vServPrest, 'vServPrest') || '',
        valorServico: val(vServPrest, 'vServ') || '',
      },
      prestador: parseNfseParty(prest) || { cnpj: '', razaoSocial: '', im: '', email: '', telefone: '', endereco: '', bairro: '', municipio: '', uf: '', cep: '' },
      tomador: parseNfseParty(toma) || { cnpj: '', razaoSocial: '', im: '', email: '', telefone: '', endereco: '', bairro: '', municipio: '', uf: '', cep: '' },
      servico: {
        descricao: val(cServ, 'xDescServ') || '',
        codigoNacional: val(cServ, 'cTribNac') || '',
        codigoMunicipal: val(cServ, 'cTribMun') || '',
        municipio: val(locPrest, 'xLocPrestacao') || '',
        issRetido: tpRetMap[val(issqn, 'tpRetISSQN')] || val(issqn, 'tpRetISSQN') || '',
        baseCalculo: val(issqn, 'vBC') || '',
        aliquota: val(issqn, 'pAliq') || '',
        valorIss: val(issqn, 'vISSQN') || '',
        valorServico: val(vServPrest, 'vServ') || '',
        valorLiquido: val(vServPrest, 'vLiq') || val(vServPrest, 'vServPrest') || '',
      },
    };
  }

  // ABRASF — at this point abrasf is always defined (nacional was falsy)
  const abrasfData = abrasf!;
  const servico = (abrasfData.Servico || {}) as XmlNode;
  const valores = ((abrasfData.Servico?.Valores) || {}) as XmlNode;
  const prestNode = (abrasfData.PrestadorServico || abrasfData.Prestador || {}) as XmlNode;
  const tomaNode = (abrasfData.TomadorServico || abrasfData.Tomador || {}) as XmlNode;

  return {
    docType: 'NFSE' as const,
    accessKey: invoice.accessKey,
    number: invoice.number,
    nfse: {
      numero: String(abrasfData.Numero || invoice.number || ''),
      dataEmissao: val(abrasfData as XmlNode, 'DataEmissao') || '',
      dataProcessamento: val(abrasfData as XmlNode, 'DataEmissaoRps') || '',
      codigoVerificacao: val(abrasfData as XmlNode, 'CodigoVerificacao') || '',
      locPrestacao: val(servico, 'MunicipioPrestacaoServico') || '',
      valorServico: val(valores, 'ValorServicos') || '',
      valorLiquido: val(valores, 'ValorLiquidoNfse') || val(valores, 'ValorServicos') || '',
    },
    prestador: parseNfseParty(prestNode) || { cnpj: '', razaoSocial: '', im: '', email: '', telefone: '', endereco: '', bairro: '', municipio: '', uf: '', cep: '' },
    tomador: parseNfseParty(tomaNode) || { cnpj: '', razaoSocial: '', im: '', email: '', telefone: '', endereco: '', bairro: '', municipio: '', uf: '', cep: '' },
    servico: {
      descricao: val(servico, 'Discriminacao') || '',
      codigoNacional: '',
      codigoMunicipal: val(servico, 'ItemListaServico', 'CodigoTributacaoMunicipio') || '',
      municipio: val(servico, 'MunicipioPrestacaoServico') || '',
      issRetido: val(valores, 'IssRetido') === '1' ? 'Sim' : val(valores, 'IssRetido') === '2' ? 'Não' : val(valores, 'IssRetido') || '',
      baseCalculo: val(valores, 'BaseCalculo') || '',
      aliquota: val(valores, 'Aliquota') || '',
      valorIss: val(valores, 'ValorIss') || val(valores, 'ValorIssRetido') || '',
      valorServico: val(valores, 'ValorServicos') || '',
      valorLiquido: val(valores, 'ValorLiquidoNfse') || val(valores, 'ValorServicos') || '',
    },
  };
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, companyId: company.id },
      select: { id: true, accessKey: true, number: true, series: true, type: true, xmlContent: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });
    }

    const result = await parseXmlSafe(invoice.xmlContent);

    const nfeProc = result.nfeProc;
    const nfe = nfeProc ? nfeProc.NFe : result.NFe;
    const infNFe = nfe ? nfe.infNFe : null;

    // Try CT-e first
    const cteProc = result.cteProc || result;
    const cteRoot = cteProc?.CTe || result.CTe;
    const infCte = cteRoot?.infCte;

    if (infCte) {
      return NextResponse.json(parseCteDetails(invoice, infCte, cteProc));
    }

    // Try NFS-e
    const nfseNacional = result?.NFSe?.infNFSe || result?.infNFSe;
    const compNfse = result.CompNfse || result.ConsultarNfseResposta?.ListaNfse?.CompNfse;
    const nfseAbrasf = compNfse?.Nfse?.InfNfse || result.Nfse?.InfNfse || result.InfNfse;
    if (nfseNacional || nfseAbrasf) {
      return NextResponse.json(parseNfseDetails(invoice, nfseNacional, nfseAbrasf));
    }

    // Otherwise try NF-e
    if (!infNFe) {
      return NextResponse.json({ error: 'Formato XML não suportado para detalhes' }, { status: 400 });
    }

    const ide = infNFe.ide || {};
    const emit = infNFe.emit || {};
    const dest = infNFe.dest || {};
    const det = infNFe.det;
    const total = infNFe.total || {};
    const transp = infNFe.transp;
    const cobr = infNFe.cobr;
    const pag = infNFe.pag;
    const infAdic = infNFe.infAdic || {};

    const tpNFMap: Record<string, string> = { '0': '0 - Entrada', '1': '1 - Saída' };
    const finNFeMap: Record<string, string> = {
      '1': '1 - NF-e normal', '2': '2 - NF-e complementar',
      '3': '3 - NF-e de ajuste', '4': '4 - Devolução',
    };
    const tpEmisMap: Record<string, string> = {
      '1': '1 - Emissão normal', '2': '2 - Contingência FS-IA',
      '3': '3 - Contingência SCAN', '4': '4 - Contingência DPEC',
      '5': '5 - Contingência FS-DA', '6': '6 - Contingência SVC-AN',
      '7': '7 - Contingência SVC-RS', '9': '9 - Contingência off-line NFC-e',
    };
    const procEmiMap: Record<string, string> = {
      '0': '0 - Emissão de NF-e com aplicativo do contribuinte',
      '1': '1 - Emissão de NF-e avulsa pelo Fisco',
      '2': '2 - Emissão de NF-e avulsa, pelo contribuinte com certificado',
      '3': '3 - Emissão NF-e pelo contribuinte com aplicativo fornecido pelo Fisco',
    };
    const indPresMap: Record<string, string> = {
      '0': '0 - Não se aplica', '1': '1 - Operação presencial',
      '2': '2 - Operação não presencial, pela Internet', '3': '3 - Operação não presencial, Teleatendimento',
      '4': '4 - NFC-e em operação com entrega a domicílio', '5': '5 - Operação presencial, fora do estabelecimento',
      '9': '9 - Operação não presencial, outros',
    };
    const indFinalMap: Record<string, string> = { '0': '0 - Normal', '1': '1 - Consumidor Final' };
    const idDestMap: Record<string, string> = {
      '1': '1 - Operação interna', '2': '2 - Operação interestadual', '3': '3 - Operação com exterior',
    };

    const protNFe = nfeProc?.protNFe?.infProt || {};

    const details = {
      docType: 'NFE' as const,
      accessKey: invoice.accessKey,
      number: invoice.number,
      series: invoice.series || '',
      nfe: {
        modelo: val(ide, 'mod'),
        serie: val(ide, 'serie'),
        numero: val(ide, 'nNF'),
        dataEmissao: val(ide, 'dhEmi', 'dEmi'),
        dataSaidaEntrada: val(ide, 'dhSaiEnt', 'dSaiEnt'),
        valorTotal: val(total.ICMSTot || {}, 'vNF'),
        emitente: {
          cnpj: val(emit, 'CNPJ', 'CPF'),
          razaoSocial: val(emit, 'xNome'),
          ie: val(emit, 'IE'),
          uf: val(emit.enderEmit || {}, 'UF'),
        },
        destinatario: {
          cnpj: val(dest, 'CNPJ', 'CPF'),
          razaoSocial: val(dest, 'xNome'),
          ie: val(dest, 'IE'),
          uf: val(dest.enderDest || {}, 'UF'),
        },
        destinoOperacao: idDestMap[ide.idDest] || val(ide, 'idDest'),
        consumidorFinal: indFinalMap[ide.indFinal] || val(ide, 'indFinal'),
        presencaComprador: indPresMap[ide.indPres] || val(ide, 'indPres'),
        processo: procEmiMap[ide.procEmi] || val(ide, 'procEmi'),
        versaoProcesso: val(ide, 'verProc'),
        tipoEmissao: tpEmisMap[ide.tpEmis] || val(ide, 'tpEmis'),
        finalidade: finNFeMap[ide.finNFe] || val(ide, 'finNFe'),
        naturezaOperacao: val(ide, 'natOp'),
        tipoOperacao: tpNFMap[ide.tpNF] || val(ide, 'tpNF'),
        digestValue: val(nfeProc?.protNFe?.infProt || {}, 'digVal') || val(nfe?.Signature?.SignedInfo?.Reference || {}, 'DigestValue'),
        protocolo: val(protNFe, 'nProt'),
        dataAutorizacao: val(protNFe, 'dhRecbto'),
      },
      emitente: parseEmitDest(emit),
      destinatario: parseEmitDest(dest),
      produtos: parseProdutos(det),
      totais: parseTotais(total),
      transporte: parseTransporte(transp),
      cobranca: parseCobranca(cobr, pag),
      infAdicionais: parseInfAdicionais(infAdic.infAdFisco, infAdic.infCpl, ide),
    };

    return NextResponse.json(details);
  } catch (error) {
    return apiError(error, 'invoices/:id/details');
  }
}
