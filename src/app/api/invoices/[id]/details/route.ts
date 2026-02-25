import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { parseXmlSafe } from '@/lib/safe-xml-parser';

function val(obj: any, ...keys: string[]): string {
  for (const k of keys) {
    if (obj?.[k] != null) return String(obj[k]);
  }
  return '';
}

function num(obj: any, key: string): string {
  const v = obj?.[key];
  if (v == null || v === '') return '';
  return String(v);
}

function parseEmitDest(node: any) {
  if (!node) return null;
  const ender = node.enderEmit || node.enderDest || {};
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

function parseProdutos(det: any) {
  if (!det) return [];
  const items = Array.isArray(det) ? det : [det];
  return items.map((item: any, idx: number) => {
    const prod = item.prod || {};
    const imposto = item.imposto || {};
    const icms = imposto.ICMS ? Object.values(imposto.ICMS)[0] as any : {};
    const ipi = imposto.IPI;
    const ipiTrib = ipi?.IPITrib || ipi?.IPINT || {};
    const pis = imposto.PIS ? Object.values(imposto.PIS)[0] as any : {};
    const cofins = imposto.COFINS ? Object.values(imposto.COFINS)[0] as any : {};

    return {
      num: item.nItem || String(idx + 1),
      codigo: val(prod, 'cProd'),
      descricao: val(prod, 'xProd'),
      ncm: val(prod, 'NCM'),
      cfop: val(prod, 'CFOP'),
      unidade: val(prod, 'uCom'),
      quantidade: num(prod, 'qCom'),
      valorUnitario: num(prod, 'vUnCom'),
      valorTotal: num(prod, 'vProd'),
      valorDesconto: num(prod, 'vDesc'),
      ean: val(prod, 'cEAN'),
      cest: val(prod, 'CEST'),
      icms: {
        orig: val(icms, 'orig'),
        cst: val(icms, 'CST', 'CSOSN'),
        baseCalculo: num(icms, 'vBC'),
        aliquota: num(icms, 'pICMS'),
        valor: num(icms, 'vICMS'),
        baseCalculoSt: num(icms, 'vBCST'),
        aliquotaSt: num(icms, 'pICMSST'),
        valorSt: num(icms, 'vICMSST'),
      },
      ipi: {
        cst: val(ipiTrib, 'CST'),
        baseCalculo: num(ipiTrib, 'vBC'),
        aliquota: num(ipiTrib, 'pIPI'),
        valor: num(ipiTrib, 'vIPI'),
      },
      pis: {
        cst: val(pis, 'CST'),
        baseCalculo: num(pis, 'vBC'),
        aliquota: num(pis, 'pPIS'),
        valor: num(pis, 'vPIS'),
      },
      cofins: {
        cst: val(cofins, 'CST'),
        baseCalculo: num(cofins, 'vBC'),
        aliquota: num(cofins, 'pCOFINS'),
        valor: num(cofins, 'vCOFINS'),
      },
    };
  });
}

function parseTotais(total: any) {
  const t = total?.ICMSTot || {};
  return {
    baseCalculoIcms: num(t, 'vBC'),
    valorIcms: num(t, 'vICMS'),
    icmsDesonerado: num(t, 'vICMSDeson'),
    fcp: num(t, 'vFCPUFDest') || num(t, 'vFCP'),
    fcpSt: num(t, 'vFCPST'),
    icmsInterestadual: num(t, 'vICMSUFDest'),
    icmsInterestadualRem: num(t, 'vICMSUFRemet'),
    baseCalculoIcmsSt: num(t, 'vBCST'),
    valorIcmsSt: num(t, 'vST'),
    icmsSubstituicao: num(t, 'vICMSSub') || num(t, 'vST'),
    fcpRetidoSt: num(t, 'vFCPSTRet'),
    fcpRetidoAnteriormenteSt: num(t, 'vFCPSTRet'),
    valorTotalProdutos: num(t, 'vProd'),
    valorFrete: num(t, 'vFrete'),
    valorSeguro: num(t, 'vSeg'),
    valorDescontos: num(t, 'vDesc'),
    valorII: num(t, 'vII'),
    valorIpi: num(t, 'vIPI'),
    valorIpiDevolvido: num(t, 'vIPIDevol'),
    valorPis: num(t, 'vPIS'),
    valorCofins: num(t, 'vCOFINS'),
    outrasDespesas: num(t, 'vOutro'),
    valorTotalNfe: num(t, 'vNF'),
    valorAproximadoTributos: num(t, 'vTotTrib'),
  };
}

function parseTransporte(transp: any) {
  if (!transp) return null;
  const transporta = transp.transporta || {};
  const vol = transp.vol;
  const volumes = vol ? (Array.isArray(vol) ? vol : [vol]) : [];

  const modFreteMap: Record<string, string> = {
    '0': '0 - Contratação do Frete por conta do Remetente (CIF)',
    '1': '1 - Contratação do Frete por conta do Destinatário/Remetente',
    '2': '2 - Contratação do Frete por conta de Terceiros',
    '3': '3 - Transporte Próprio por conta do Remetente',
    '4': '4 - Transporte Próprio por conta do Destinatário',
    '9': '9 - Sem Ocorrência de Transporte',
  };

  return {
    modalidadeFrete: modFreteMap[transp.modFrete] || transp.modFrete || '',
    transportador: {
      cnpj: val(transporta, 'CNPJ', 'CPF'),
      razaoSocial: val(transporta, 'xNome'),
      ie: val(transporta, 'IE'),
      endereco: val(transporta, 'xEnder'),
      municipio: val(transporta, 'xMun'),
      uf: val(transporta, 'UF'),
    },
    volumes: volumes.map((v: any) => ({
      quantidade: num(v, 'qVol'),
      especie: val(v, 'esp'),
      marca: val(v, 'marca'),
      numeracao: val(v, 'nVol'),
      pesoLiquido: num(v, 'pesoL'),
      pesoBruto: num(v, 'pesoB'),
    })),
  };
}

function parseCobranca(cobr: any, pag: any) {
  const pagItems = pag?.detPag;
  const pagList = pagItems ? (Array.isArray(pagItems) ? pagItems : [pagItems]) : [];

  const tPagMap: Record<string, string> = {
    '01': '01 - Dinheiro', '02': '02 - Cheque', '03': '03 - Cartão de Crédito',
    '04': '04 - Cartão de Débito', '05': '05 - Crédito Loja',
    '10': '10 - Vale Alimentação', '11': '11 - Vale Refeição',
    '12': '12 - Vale Presente', '13': '13 - Vale Combustível',
    '14': '14 - Duplicata Mercantil', '15': '15 - Boleto Bancário',
    '16': '16 - Depósito Bancário', '17': '17 - PIX',
    '90': '90 - Sem Pagamento', '99': '99 - Outros',
  };

  const formasPagamento = pagList.map((p: any) => ({
    forma: tPagMap[val(p, 'tPag')] || val(p, 'tPag'),
    valor: num(p, 'vPag'),
    tipoIntegracao: val(p, 'tpIntegra'),
    cnpjCredenciadora: val(p, 'CNPJ'),
    autorizacao: val(p, 'cAut'),
    troco: num(pag, 'vTroco') || '0,00',
    bandeira: val(p, 'tBand'),
  }));

  const fat = cobr?.fat;
  const fatura = fat ? {
    numero: val(fat, 'nFat'),
    valorOriginal: num(fat, 'vOrig'),
    valorDesconto: num(fat, 'vDesc'),
    valorLiquido: num(fat, 'vLiq'),
  } : null;

  const dupItems = cobr?.dup;
  const dupList = dupItems ? (Array.isArray(dupItems) ? dupItems : [dupItems]) : [];
  const duplicatas = dupList.map((d: any) => ({
    numero: val(d, 'nDup'),
    vencimento: val(d, 'dVenc'),
    valor: num(d, 'vDup'),
  }));

  return { formasPagamento, fatura, duplicatas };
}

function parseInfAdicionais(infAdFisco: any, infCpl: any, ide: any) {
  const tpImpMap: Record<string, string> = {
    '1': '1 - DANFE normal, Retrato',
    '2': '2 - DANFE normal, Paisagem',
    '3': '3 - DANFE Simplificado',
    '4': '4 - DANFE NFC-e',
    '5': '5 - DANFE NFC-e em mensagem eletrônica',
  };
  return {
    formatoImpressao: tpImpMap[ide?.tpImp] || ide?.tpImp || '',
    infFisco: infAdFisco || '',
    infComplementar: infCpl || '',
  };
}

function parseCteParty(node: any) {
  if (!node) return null;
  const ender = node.enderReme || node.enderDest || node.enderExped || node.enderReceb || node.enderToma || {};
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

function parseCteDetails(invoice: any, infCte: any, cteProc: any) {
  const ide = infCte.ide || {};
  const emit = infCte.emit || {};
  const rem = infCte.rem || {};
  const dest = infCte.dest || {};
  const exped = infCte.exped || {};
  const receb = infCte.receb || {};
  const vPrest = infCte.vPrest || {};
  const infCteNorm = infCte.infCteNorm || {};
  const infCarga = infCteNorm.infCarga || {};
  const infDoc = infCteNorm.infDoc || {};
  const seg = infCteNorm.seg || {};
  const imp = infCte.imp || {};
  const infAdic = infCte.infAdic || {};

  const protCTe = cteProc?.protCTe?.infProt || {};

  // Tomador resolution
  const tomaMap: Record<string, string> = {
    '0': 'Remetente', '1': 'Expedidor', '2': 'Recebedor', '3': 'Destinatário', '4': 'Outros',
  };
  const tomaCode = val(ide, 'toma3', 'toma4') ? val(ide.toma3 || ide.toma4 || {}, 'toma') : '';

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
  const icmsNode = imp.ICMS ? Object.values(imp.ICMS)[0] as any : {};

  // NF-e referenciadas
  const infNFeItems = infDoc.infNFe;
  const nfeRefs = infNFeItems ? (Array.isArray(infNFeItems) ? infNFeItems : [infNFeItems]) : [];
  const infNFItems = infDoc.infNF;
  const nfRefs = infNFItems ? (Array.isArray(infNFItems) ? infNFItems : [infNFItems]) : [];
  const infOutrosItems = infDoc.infOutros;
  const outrosRefs = infOutrosItems ? (Array.isArray(infOutrosItems) ? infOutrosItems : [infOutrosItems]) : [];

  // Componentes de valor
  const compItems = vPrest.Comp;
  const componentes = compItems ? (Array.isArray(compItems) ? compItems : [compItems]) : [];

  // Medidas da carga
  const infQItems = infCarga.infQ;
  const medidas = infQItems ? (Array.isArray(infQItems) ? infQItems : [infQItems]) : [];

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
      tipoCte: tpCTeMap[ide.tpCTe] || val(ide, 'tpCTe'),
      tipoServico: tpServMap[ide.tpServ] || val(ide, 'tpServ'),
      modal: modalMap[ide.modal] || val(ide, 'modal'),
      tomador: tomaMap[tomaCode] || tomaCode,
      municipioOrigem: [val(ide, 'cMunIni'), val(ide, 'xMunIni')].filter(Boolean).join(' - '),
      ufOrigem: val(ide, 'UFIni'),
      municipioDestino: [val(ide, 'cMunFim'), val(ide, 'xMunFim')].filter(Boolean).join(' - '),
      ufDestino: val(ide, 'UFFim'),
      valorPrestacao: num(vPrest, 'vTPrest'),
      valorReceber: num(vPrest, 'vRec'),
      protocolo: val(protCTe, 'nProt'),
      dataAutorizacao: val(protCTe, 'dhRecbto'),
    },
    emitente: parseCteParty(emit),
    remetente: parseCteParty(rem),
    destinatario: parseCteParty(dest),
    expedidor: parseCteParty(exped),
    recebedor: parseCteParty(receb),
    carga: {
      valorCarga: num(infCarga, 'vCarga'),
      produtoPredominante: val(infCarga, 'proPred'),
      outrCaract: val(infCarga, 'xOutCat'),
      medidas: medidas.map((q: any) => ({
        unidade: cUnidMap[val(q, 'cUnid')] || val(q, 'cUnid'),
        tipoMedida: val(q, 'tpMed'),
        quantidade: num(q, 'qCarga'),
      })),
    },
    documentos: {
      nfeRefs: nfeRefs.map((n: any) => ({
        chave: val(n, 'chave'),
      })),
      nfRefs: nfRefs.map((n: any) => ({
        serie: val(n, 'serie'),
        numero: val(n, 'nDoc'),
        dataEmissao: val(n, 'dEmi'),
        valorTotal: num(n, 'vBC'),
      })),
      outrosRefs: outrosRefs.map((o: any) => ({
        tipo: val(o, 'tpDoc'),
        descricao: val(o, 'descOutros'),
        numero: val(o, 'nDoc'),
        dataEmissao: val(o, 'dEmi'),
        valor: num(o, 'vDocFisc'),
      })),
    },
    componentes: componentes.map((c: any) => ({
      nome: val(c, 'xNome'),
      valor: num(c, 'vComp'),
    })),
    impostos: {
      icms: {
        cst: val(icmsNode, 'CST'),
        baseCalculo: num(icmsNode, 'vBC'),
        aliquota: num(icmsNode, 'pICMS'),
        valor: num(icmsNode, 'vICMS'),
        reducaoBC: num(icmsNode, 'pRedBC'),
        icmsOutraUF: num(icmsNode, 'vICMSOutraUF'),
      },
      valorTotalTributos: num(imp, 'vTotTrib') || num(infCte, 'vTotTrib'),
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
        valorTotal: num(total.ICMSTot || {}, 'vNF'),
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
    console.error('Error parsing invoice details:', error);
    return NextResponse.json({ error: 'Erro ao processar detalhes' }, { status: 500 });
  }
}
