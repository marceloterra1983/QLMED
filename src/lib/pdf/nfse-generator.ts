import { gv } from '@/lib/xml-helpers';
import type { XmlNode } from '@/types/xml-common';
import type { NfseData, NfsePartyData, PdfInvoiceView } from './pdf-types';
import { esc, fmtCnpj, fmtCep, fmtFone, fmtNum, fmtDate } from './pdf-utils';
import { PDF_CSS } from './pdf-css';

// ==================== NFS-e Helpers ====================

function emptyNfseParty(): NfsePartyData {
  return { nome: '', fantasia: '', doc: '', im: '', email: '', fone: '', endereco: '', bairro: '', municipio: '', uf: '', cep: '' };
}

function normalizeNfseParty(node: XmlNode, enderNode: XmlNode): NfsePartyData {
  return {
    nome: gv(node, 'xNome') || gv(node, 'RazaoSocial') || '',
    fantasia: gv(node, 'xFant') || gv(node, 'NomeFantasia') || '',
    doc: gv(node, 'CNPJ') || gv(node, 'CPF') || gv(node, 'CpfCnpj', 'Cnpj') || gv(node, 'Cnpj') || '',
    im: gv(node, 'IM') || gv(node, 'InscricaoMunicipal') || '',
    email: gv(node, 'email') || gv(node, 'Email') || '',
    fone: gv(enderNode, 'fone') || gv(node, 'Contato', 'Telefone') || '',
    endereco: [gv(enderNode, 'xLgr') || gv(enderNode, 'Endereco'), gv(enderNode, 'nro') || gv(enderNode, 'Numero')].filter(Boolean).join(', '),
    bairro: gv(enderNode, 'xBairro') || gv(enderNode, 'Bairro') || '',
    municipio: gv(enderNode, 'xMun') || '',
    uf: gv(enderNode, 'UF') || '',
    cep: gv(enderNode, 'CEP') || gv(enderNode, 'Cep') || '',
  };
}

// Map IBGE municipality codes to names (most common in MS + capitals)
function ibgeMunName(code: string): string {
  const map: Record<string, string> = {
    '5002704': 'CAMPO GRANDE', '5003702': 'DOURADOS', '5000203': 'AGUA CLARA',
    '5007109': 'TRES LAGOAS', '5003207': 'CORUMBA', '5005707': 'PONTA PORA',
    '3550308': 'SAO PAULO', '3304557': 'RIO DE JANEIRO', '3106200': 'BELO HORIZONTE',
    '5300108': 'BRASILIA', '4106902': 'CURITIBA', '4314902': 'PORTO ALEGRE',
    '2927408': 'SALVADOR', '2611606': 'RECIFE', '2304400': 'FORTALEZA',
    '1302603': 'MANAUS', '1501402': 'BELEM', '5208707': 'GOIANIA',
  };
  return map[code] || code;
}

// ==================== Data Extraction ====================

export function extractNfseData(parsed: XmlNode, invoice: PdfInvoiceView): NfseData {
  // ADN / Padrao Nacional
  const infNFSe = ((parsed?.NFSe as XmlNode)?.infNFSe || parsed?.infNFSe) as XmlNode | undefined;
  if (infNFSe) {
    const dps = ((infNFSe.DPS as XmlNode)?.infDPS || {}) as XmlNode;
    const emitNode = (infNFSe.emit || dps.prest || {}) as XmlNode;
    const tomaNode = (dps.toma || {}) as XmlNode;
    const servNode = (dps.serv || {}) as XmlNode;
    const cServNode = (servNode.cServ || {}) as XmlNode;
    const valoresTop = (infNFSe.valores || {}) as XmlNode;
    const valoresDps = (dps.valores || {}) as XmlNode;
    const tribNode = (valoresDps.trib || {}) as XmlNode;
    const tribMun = (tribNode.tribMun || {}) as XmlNode;
    const vServPrest = (valoresDps.vServPrest || {}) as XmlNode;
    const vDedRed = (valoresDps.vDedRed || {}) as XmlNode;
    const regTrib = (emitNode.regTrib || (dps.prest as XmlNode)?.regTrib || {}) as XmlNode;

    const emitEnder = (emitNode.enderNac || {}) as XmlNode;
    const tomaEnder = ((tomaNode.end as XmlNode)?.endNac || tomaNode.end || {}) as XmlNode;
    const tomaEnderFields = (tomaNode.end || {}) as XmlNode;

    const emit = normalizeNfseParty(emitNode, emitEnder);
    if (!emit.municipio && gv(emitEnder, 'cMun')) emit.municipio = ibgeMunName(gv(emitEnder, 'cMun'));

    const toma = normalizeNfseParty(tomaNode, { ...tomaEnder as XmlNode, ...tomaEnderFields as XmlNode } as XmlNode);
    if (!toma.municipio && gv(tomaEnder, 'cMun')) toma.municipio = ibgeMunName(gv(tomaEnder, 'cMun'));
    if (!toma.endereco) {
      toma.endereco = [gv(tomaEnderFields, 'xLgr'), gv(tomaEnderFields, 'nro')].filter(Boolean).join(', ');
      toma.bairro = gv(tomaEnderFields, 'xBairro') || toma.bairro;
    }

    return {
      nNFSe: gv(infNFSe, 'nNFSe') || gv(dps, 'nDPS') || invoice.number,
      serie: gv(dps, 'serie') || invoice.series || '',
      dhEmi: gv(dps, 'dhEmi') || gv(infNFSe, 'dhProc') || invoice.issueDate.toISOString(),
      dCompet: gv(dps, 'dCompet') || '',
      accessKey: invoice.accessKey,
      xLocEmi: gv(infNFSe, 'xLocEmi') || '',
      xLocPrestacao: gv(infNFSe, 'xLocPrestacao') || '',
      xTribNac: gv(infNFSe, 'xTribNac') || '',
      xTribMun: gv(infNFSe, 'xTribMun') || '',
      xNBS: gv(infNFSe, 'xNBS') || '',
      cTribNac: gv(cServNode, 'cTribNac') || '',
      cTribMun: gv(cServNode, 'cTribMun') || '',
      xDescServ: gv(cServNode, 'xDescServ') || '',
      emit: { ...emit, nome: emit.nome || invoice.senderName, doc: emit.doc || invoice.senderCnpj },
      toma: { ...toma, nome: toma.nome || invoice.recipientName, doc: toma.doc || invoice.recipientCnpj },
      vServ: gv(vServPrest, 'vServ') || String(invoice.totalValue || 0),
      vLiq: gv(valoresTop, 'vLiq') || gv(vServPrest, 'vLiq') || gv(vServPrest, 'vServ') || String(invoice.totalValue || 0),
      vCalcDR: gv(valoresTop, 'vCalcDR') || '',
      vDR: gv(vDedRed, 'vDR') || '',
      vBC: gv(valoresTop, 'vBC') || '',
      pAliq: gv(valoresTop, 'pAliqAplic') || gv(tribMun, 'pAliq') || '',
      vISSQN: gv(valoresTop, 'vISSQN') || '',
      vTotalRet: gv(valoresTop, 'vTotalRet') || '',
      cStat: gv(infNFSe, 'cStat') || '',
      nDFSe: gv(infNFSe, 'nDFSe') || '',
      opSimpNac: gv(regTrib, 'opSimpNac') || '',
      regEspTrib: gv(regTrib, 'regEspTrib') || '',
      tpRetISSQN: gv(tribMun, 'tpRetISSQN') || '',
    };
  }

  // ABRASF / Municipal
  const compNfse = (parsed?.CompNfse || ((parsed?.ConsultarNfseResposta as XmlNode)?.ListaNfse as XmlNode)?.CompNfse) as XmlNode | undefined;
  const nfse = ((compNfse?.Nfse as XmlNode)?.InfNfse || (parsed?.Nfse as XmlNode)?.InfNfse || parsed?.InfNfse) as XmlNode | undefined;
  if (nfse) {
    const servico = (nfse.Servico || {}) as XmlNode;
    const valores = (servico.Valores || {}) as XmlNode;
    const prestador = (nfse.PrestadorServico || nfse.Prestador || {}) as XmlNode;
    const tomador = (nfse.TomadorServico || nfse.Tomador || {}) as XmlNode;
    const idPrest = (prestador.IdentificacaoPrestador || {}) as XmlNode;
    const idToma = (tomador.IdentificacaoTomador || {}) as XmlNode;
    const enderPrest = (prestador.Endereco || {}) as XmlNode;
    const enderToma = (tomador.Endereco || {}) as XmlNode;

    const emit: NfsePartyData = {
      nome: gv(prestador, 'RazaoSocial') || gv(prestador, 'NomeFantasia') || invoice.senderName,
      fantasia: gv(prestador, 'NomeFantasia') || '',
      doc: gv(idPrest, 'CpfCnpj', 'Cnpj') || gv(idPrest, 'Cnpj') || invoice.senderCnpj,
      im: gv(idPrest, 'InscricaoMunicipal') || '',
      email: gv(prestador, 'Contato', 'Email') || '',
      fone: gv(prestador, 'Contato', 'Telefone') || '',
      endereco: [gv(enderPrest, 'Endereco'), gv(enderPrest, 'Numero')].filter(Boolean).join(', '),
      bairro: gv(enderPrest, 'Bairro') || '',
      municipio: gv(enderPrest, 'Cidade') || '',
      uf: gv(enderPrest, 'Estado') || gv(enderPrest, 'Uf') || '',
      cep: gv(enderPrest, 'Cep') || '',
    };
    const toma: NfsePartyData = {
      nome: gv(tomador, 'RazaoSocial') || gv(tomador, 'NomeFantasia') || invoice.recipientName,
      fantasia: '',
      doc: gv(idToma, 'CpfCnpj', 'Cnpj') || gv(idToma, 'Cnpj') || invoice.recipientCnpj,
      im: gv(idToma, 'InscricaoMunicipal') || '',
      email: gv(tomador, 'Contato', 'Email') || '',
      fone: gv(tomador, 'Contato', 'Telefone') || '',
      endereco: [gv(enderToma, 'Endereco'), gv(enderToma, 'Numero')].filter(Boolean).join(', '),
      bairro: gv(enderToma, 'Bairro') || '',
      municipio: gv(enderToma, 'Cidade') || '',
      uf: gv(enderToma, 'Estado') || gv(enderToma, 'Uf') || '',
      cep: gv(enderToma, 'Cep') || '',
    };

    return {
      nNFSe: gv(nfse, 'Numero') || invoice.number,
      serie: '',
      dhEmi: gv(nfse, 'DataEmissao') || invoice.issueDate.toISOString(),
      dCompet: gv(nfse, 'Competencia') || '',
      accessKey: invoice.accessKey,
      xLocEmi: '',
      xLocPrestacao: gv(servico, 'MunicipioIncidencia') || '',
      xTribNac: gv(servico, 'Discriminacao') || '',
      xTribMun: '',
      xNBS: '',
      cTribNac: gv(servico, 'ItemListaServico') || gv(servico, 'CodigoTributacaoMunicipio') || '',
      cTribMun: gv(servico, 'CodigoTributacaoMunicipio') || '',
      xDescServ: gv(servico, 'Discriminacao') || '',
      emit,
      toma,
      vServ: gv(valores, 'ValorServicos') || String(invoice.totalValue || 0),
      vLiq: gv(valores, 'ValorLiquidoNfse') || gv(valores, 'ValorServicos') || String(invoice.totalValue || 0),
      vCalcDR: '',
      vDR: gv(valores, 'ValorDeducoes') || '',
      vBC: gv(valores, 'BaseCalculo') || '',
      pAliq: gv(valores, 'Aliquota') || '',
      vISSQN: gv(valores, 'ValorIss') || '',
      vTotalRet: gv(valores, 'ValorIssRetido') || '',
      cStat: '',
      nDFSe: gv(nfse, 'CodigoVerificacao') || '',
      opSimpNac: '',
      regEspTrib: '',
      tpRetISSQN: '',
    };
  }

  // Fallback from invoice metadata only
  const emit = emptyNfseParty();
  emit.nome = invoice.senderName;
  emit.doc = invoice.senderCnpj;
  const toma = emptyNfseParty();
  toma.nome = invoice.recipientName;
  toma.doc = invoice.recipientCnpj;
  return {
    nNFSe: invoice.number, serie: invoice.series || '', dhEmi: invoice.issueDate.toISOString(),
    dCompet: '', accessKey: invoice.accessKey, xLocEmi: '', xLocPrestacao: '',
    xTribNac: '', xTribMun: '', xNBS: '', cTribNac: '', cTribMun: '', xDescServ: '',
    emit, toma, vServ: String(invoice.totalValue || 0), vLiq: String(invoice.totalValue || 0),
    vCalcDR: '', vDR: '', vBC: '', pAliq: '', vISSQN: '', vTotalRet: '',
    cStat: '', nDFSe: '', opSimpNac: '', regEspTrib: '', tpRetISSQN: '',
  };
}

// ==================== HTML Builder ====================

export function buildNfseHtml(d: NfseData, autoPrint: boolean): string {
  const now = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const title = `NFS-e ${d.nNFSe}`;

  const retLabel: Record<string, string> = {
    '1': 'ISS Retido pelo Tomador',
    '2': 'ISS Retido pelo Intermediario',
    '0': 'Sem retencao',
  };
  const simpNacLabel: Record<string, string> = {
    '1': 'Nao optante',
    '2': 'Optante - Microempresa',
    '3': 'Optante - Empresa de Pequeno Porte',
  };

  const partySection = (label: string, party: NfsePartyData) => `
    <div class="nfse-section"><div class="nfse-section-header">${esc(label)}</div><div class="nfse-section-body">
      <div class="nfse-field full"><span class="nfse-lbl">Razao Social</span><span class="nfse-val">${esc(party.nome || '-')}</span></div>
      ${party.fantasia ? `<div class="nfse-field full"><span class="nfse-lbl">Nome Fantasia</span><span class="nfse-val">${esc(party.fantasia)}</span></div>` : ''}
      <div class="nfse-field"><span class="nfse-lbl">CNPJ/CPF</span><span class="nfse-val">${esc(fmtCnpj(party.doc || ''))}</span></div>
      ${party.im ? `<div class="nfse-field"><span class="nfse-lbl">Inscricao Municipal</span><span class="nfse-val">${esc(party.im)}</span></div>` : ''}
      ${party.email ? `<div class="nfse-field"><span class="nfse-lbl">E-mail</span><span class="nfse-val">${esc(party.email)}</span></div>` : ''}
      ${party.fone ? `<div class="nfse-field"><span class="nfse-lbl">Telefone</span><span class="nfse-val">${esc(fmtFone(party.fone))}</span></div>` : ''}
      ${party.endereco ? `<div class="nfse-field full"><span class="nfse-lbl">Endereco</span><span class="nfse-val">${esc(party.endereco)}${party.bairro ? ` - ${esc(party.bairro)}` : ''}</span></div>` : ''}
      ${party.municipio || party.uf ? `
      <div class="nfse-field"><span class="nfse-lbl">Municipio</span><span class="nfse-val">${esc(party.municipio || '-')}</span></div>
      <div class="nfse-field" style="max-width:40px"><span class="nfse-lbl">UF</span><span class="nfse-val">${esc(party.uf || '-')}</span></div>
      ${party.cep ? `<div class="nfse-field"><span class="nfse-lbl">CEP</span><span class="nfse-val">${esc(fmtCep(party.cep))}</span></div>` : ''}` : ''}
    </div></div>`;

  const NFSE_CSS = `
    .nfse-header { display:grid; grid-template-columns:1fr auto; gap:0; border:1px solid #000; margin-bottom:4px; }
    .nfse-emit-box { padding:6px 8px; border-right:1px solid #000; }
    .nfse-emit-nome { font-size:13px; font-weight:bold; margin-bottom:2px; }
    .nfse-emit-end { font-size:8px; color:#333; line-height:1.4; }
    .nfse-title-box { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:6px 14px; min-width:170px; text-align:center; }
    .nfse-title { font-size:14px; font-weight:900; letter-spacing:2px; }
    .nfse-subtitle { font-size:7px; font-weight:bold; margin-bottom:4px; }
    .nfse-num { font-size:12px; font-weight:bold; margin-top:4px; }
    .nfse-section { border:1px solid #000; margin-bottom:3px; }
    .nfse-section-header { background:#eee; font-size:7px; font-weight:bold; text-transform:uppercase; padding:1px 4px; border-bottom:1px solid #000; letter-spacing:.5px; }
    .nfse-section-body { display:flex; flex-wrap:wrap; padding:2px; gap:0; }
    .nfse-field { display:flex; flex-direction:column; padding:1px 4px; min-width:80px; flex:1; }
    .nfse-field.full { flex:0 0 100%; width:100%; }
    .nfse-lbl { font-size:6px; color:#555; text-transform:uppercase; font-weight:bold; }
    .nfse-val { font-size:9px; }
    .nfse-key-box { border:1px solid #000; padding:4px 6px; margin-bottom:3px; }
    .nfse-key-box .nfse-lbl { font-size:6.5px; font-weight:bold; text-transform:uppercase; color:#555; margin-bottom:1px; }
    .nfse-key-val { font-family:monospace; font-size:9px; letter-spacing:.3px; font-weight:bold; }
    .nfse-status-box { display:flex; justify-content:space-between; align-items:center; border:1px solid #000; padding:4px 8px; margin-bottom:3px; background:#f9f9f9; }
    .nfse-status-label { font-size:7px; color:#555; text-transform:uppercase; }
    .nfse-status-val { font-size:9px; font-weight:bold; }
    .nfse-desc-box { border:1px solid #000; padding:4px 6px; margin-bottom:3px; font-size:8px; line-height:1.4; }
    .nfse-desc-box .nfse-lbl { font-size:6.5px; font-weight:bold; text-transform:uppercase; color:#555; margin-bottom:2px; }
    .nfse-valor-destaque { display:flex; justify-content:space-between; padding:4px 8px; border-top:2px solid #000; font-weight:bold; font-size:10px; }
    .nfse-valor-sub { display:flex; justify-content:space-between; padding:3px 8px; border-top:1px solid #ccc; font-size:8px; }
    .right { text-align:right; }
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>
    ${PDF_CSS}
    ${NFSE_CSS}
    @media print {
      body { margin:0; }
      .page { margin:0; padding:4mm; box-shadow:none; }
    }
  </style>
</head>
<body>
  <div class="page">

    <!-- CHAVE DE ACESSO / IDENTIFICACAO -->
    <div class="nfse-key-box">
      <div class="nfse-lbl">Identificacao da NFS-e</div>
      <div class="nfse-key-val">${esc(d.accessKey)}</div>
    </div>

    <!-- HEADER: PRESTADOR + TITULO -->
    <div class="nfse-header">
      <div class="nfse-emit-box">
        <div class="nfse-emit-nome">${esc(d.emit.nome || '-')}</div>
        <div class="nfse-emit-end">
          ${d.emit.endereco ? `${esc(d.emit.endereco)}${d.emit.bairro ? ` - ${esc(d.emit.bairro)}` : ''}<br>` : ''}
          ${d.emit.municipio || d.emit.uf ? `${esc(d.emit.municipio)}/${esc(d.emit.uf)}` : ''}${d.emit.cep ? ` &nbsp;&bull;&nbsp; CEP: ${esc(fmtCep(d.emit.cep))}` : ''}<br>
          CNPJ: ${esc(fmtCnpj(d.emit.doc || ''))}${d.emit.im ? ` &nbsp;&bull;&nbsp; IM: ${esc(d.emit.im)}` : ''}
          ${d.emit.email ? `<br>E-mail: ${esc(d.emit.email)}` : ''}
        </div>
      </div>
      <div class="nfse-title-box">
        <div class="nfse-subtitle">NOTA FISCAL DE</div>
        <div class="nfse-title">SERVICO</div>
        <div class="nfse-subtitle">ELETR&Ocirc;NICA - NFS-e</div>
        <div class="nfse-num">N&ordm; ${esc(d.nNFSe)}</div>
        ${d.serie ? `<div style="font-size:8px;">S&eacute;rie ${esc(d.serie)}</div>` : ''}
        <div style="font-size:8px; margin-top:2px;">Emiss&atilde;o: ${fmtDate(d.dhEmi)}</div>
      </div>
    </div>

    <!-- STATUS / COMPETENCIA -->
    <div class="nfse-status-box">
      ${d.dCompet ? `<div><div class="nfse-status-label">Compet&ecirc;ncia</div><div class="nfse-status-val">${fmtDate(d.dCompet)}</div></div>` : ''}
      ${d.xLocPrestacao ? `<div><div class="nfse-status-label">Local da Presta&ccedil;&atilde;o</div><div class="nfse-status-val">${esc(d.xLocPrestacao)}</div></div>` : ''}
      ${d.nDFSe ? `<div><div class="nfse-status-label">N&ordm; DFS-e</div><div class="nfse-status-val">${esc(d.nDFSe)}</div></div>` : ''}
    </div>

    <!-- PRESTADOR -->
    ${partySection('Prestador de Servi&ccedil;os', d.emit)}

    <!-- TOMADOR -->
    ${partySection('Tomador de Servi&ccedil;os', d.toma)}

    <!-- CLASSIFICACAO DO SERVICO -->
    <div class="nfse-section"><div class="nfse-section-header">Servi&ccedil;o</div><div class="nfse-section-body">
      ${d.cTribNac ? `<div class="nfse-field"><span class="nfse-lbl">C&oacute;digo Tributa&ccedil;&atilde;o Nacional</span><span class="nfse-val">${esc(d.cTribNac)}</span></div>` : ''}
      ${d.cTribMun ? `<div class="nfse-field"><span class="nfse-lbl">C&oacute;digo Tributa&ccedil;&atilde;o Municipal</span><span class="nfse-val">${esc(d.cTribMun)}</span></div>` : ''}
      ${d.xNBS ? `<div class="nfse-field"><span class="nfse-lbl">NBS</span><span class="nfse-val">${esc(d.xNBS)}</span></div>` : ''}
      ${d.xTribNac ? `<div class="nfse-field full"><span class="nfse-lbl">Descri&ccedil;&atilde;o Nacional</span><span class="nfse-val">${esc(d.xTribNac)}</span></div>` : ''}
      ${d.xTribMun ? `<div class="nfse-field full"><span class="nfse-lbl">Descri&ccedil;&atilde;o Municipal</span><span class="nfse-val">${esc(d.xTribMun)}</span></div>` : ''}
    </div></div>

    <!-- DESCRICAO DO SERVICO -->
    ${d.xDescServ ? `
    <div class="nfse-desc-box">
      <div class="nfse-lbl">Discrimina&ccedil;&atilde;o do Servi&ccedil;o</div>
      <div style="white-space:pre-wrap;">${esc(d.xDescServ)}</div>
    </div>` : ''}

    <!-- VALORES -->
    <div class="nfse-section">
      <div class="nfse-section-header">Valores</div>
      <div class="nfse-valor-destaque">
        <span>VALOR L&Iacute;QUIDO DA NFS-e</span>
        <span>R$ ${fmtNum(d.vLiq || '0', 2)}</span>
      </div>
      <div class="nfse-valor-sub">
        <span>Valor Bruto dos Servi&ccedil;os</span>
        <span>R$ ${fmtNum(d.vServ || '0', 2)}</span>
      </div>
      ${d.vDR ? `<div class="nfse-valor-sub"><span>Dedu&ccedil;&otilde;es / Redu&ccedil;&otilde;es</span><span>R$ ${fmtNum(d.vDR, 2)}</span></div>` : ''}
      ${d.vCalcDR ? `<div class="nfse-valor-sub"><span>Base Dedu&ccedil;&atilde;o/Redu&ccedil;&atilde;o</span><span>R$ ${fmtNum(d.vCalcDR, 2)}</span></div>` : ''}
    </div>

    <!-- TRIBUTOS -->
    <div class="nfse-section"><div class="nfse-section-header">Tributos</div><div class="nfse-section-body">
      ${d.vBC ? `<div class="nfse-field"><span class="nfse-lbl">Base de C&aacute;lculo</span><span class="nfse-val">R$ ${fmtNum(d.vBC, 2)}</span></div>` : ''}
      ${d.pAliq ? `<div class="nfse-field"><span class="nfse-lbl">Al&iacute;quota ISS</span><span class="nfse-val">${fmtNum(d.pAliq, 2)}%</span></div>` : ''}
      ${d.vISSQN ? `<div class="nfse-field"><span class="nfse-lbl">Valor ISSQN</span><span class="nfse-val">R$ ${fmtNum(d.vISSQN, 2)}</span></div>` : ''}
      ${d.vTotalRet ? `<div class="nfse-field"><span class="nfse-lbl">Valor Retido</span><span class="nfse-val">R$ ${fmtNum(d.vTotalRet, 2)}</span></div>` : ''}
      ${d.tpRetISSQN ? `<div class="nfse-field full"><span class="nfse-lbl">Tipo de Reten&ccedil;&atilde;o</span><span class="nfse-val">${esc(retLabel[d.tpRetISSQN] || d.tpRetISSQN)}</span></div>` : ''}
      ${d.opSimpNac ? `<div class="nfse-field full"><span class="nfse-lbl">Simples Nacional</span><span class="nfse-val">${esc(simpNacLabel[d.opSimpNac] || d.opSimpNac)}</span></div>` : ''}
    </div></div>

    <!-- RODAPE -->
    <div class="footer-line">
      <span>DATA E HORA DE IMPRESS&Atilde;O: ${now}</span>
      <span>QLMED - Sistema de Gest&atilde;o Fiscal</span>
    </div>

  </div>
  ${autoPrint ? '<script>window.addEventListener("load", function() { window.print(); });</script>' : ''}
</body>
</html>`;
}
