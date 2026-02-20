import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import xml2js from 'xml2js';

const parser = new xml2js.Parser({
  explicitArray: false,
  mergeAttrs: true,
  tagNameProcessors: [xml2js.processors.stripPrefix],
});

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

    const result = await parser.parseStringPromise(invoice.xmlContent);

    const nfeProc = result.nfeProc;
    const nfe = nfeProc ? nfeProc.NFe : result.NFe;
    const infNFe = nfe ? nfe.infNFe : null;

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
