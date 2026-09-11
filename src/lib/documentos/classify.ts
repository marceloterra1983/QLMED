import type { CompanyDocumentKind } from '@prisma/client';
import { CERTIDAO_FOLDER } from './constants';
import type { DocumentosCategory } from './families';

/** NFC + sem acento + minúsculas — nomes do Graph chegam em NFD. */
export function fold(value: string): string {
  return value
    .normalize('NFC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const FOLDER_FEDERAIS = fold(CERTIDAO_FOLDER.cnd_federal);
const FOLDER_FGTS = fold(CERTIDAO_FOLDER.crf_fgts);
const FOLDER_CNDT = fold(CERTIDAO_FOLDER.cndt);
const FOLDER_ESTADUAIS = fold(CERTIDAO_FOLDER.cnd_estadual_ms);
const FOLDER_MUNICIPAIS = fold(CERTIDAO_FOLDER.cnd_municipal_mobiliario);
const TOKEN_TRIBUNAL = fold('Tribunal');
const TOKEN_MATO_GROSSO = fold('MATO GROSSO');
const TOKEN_SUL = fold('SUL');
const TOKEN_MOBILIARIO = fold('MOBILIARIO');
const TOKEN_GERAIS = fold('gerais');

function classifyCertidao(folderName: string, fileName: string): CompanyDocumentKind {
  const folder = fold(folderName);
  const file = fold(fileName);

  if (folder === FOLDER_FEDERAIS) {
    return file.includes(TOKEN_TRIBUNAL) ? 'outro' : 'cnd_federal';
  }
  if (folder === FOLDER_FGTS) return 'crf_fgts';
  if (folder === FOLDER_CNDT) return 'cndt';
  if (folder === FOLDER_ESTADUAIS) {
    if (file.includes(TOKEN_MATO_GROSSO) && !file.includes(TOKEN_SUL)) return 'cnd_estadual_mt';
    return 'cnd_estadual_ms';
  }
  if (folder === FOLDER_MUNICIPAIS) {
    if (file.includes(TOKEN_MOBILIARIO)) return 'cnd_municipal_mobiliario';
    if (file.includes(TOKEN_GERAIS)) return 'cnd_municipal_gerais';
    return 'outro';
  }
  return 'outro';
}

/**
 * Regras a partir dos nomes reais da pasta sanitária, sem acento e sem caixa.
 * PROTOCOLO / PUBLICACAO DIARIO vêm primeiro: "PUBLICAÇÃO DIARIO OFICIAL AFE"
 * contém AFE mas é comprovativo de trâmite, não o documento vigente.
 */
function classifySanitaria(fileName: string): CompanyDocumentKind {
  const file = fold(fileName);
  if (file.includes('protocolo') || file.includes('publicacao diario')) return 'outro';
  if (file.includes('afe')) return 'afe_anvisa';
  if (file.includes('pragas')) return 'controle_pragas';
  if (file.includes('veiculo') && file.includes('sanitaria')) return 'licenca_sanitaria_veiculo';
  if (file.includes('licenca sanitaria') || file.includes('alvara licenca')) return 'licenca_sanitaria';
  if (file.includes('alvara') && file.includes('prefeitura')) return 'alvara_funcionamento';
  if (file.includes('crf')) return 'crf_conselho';
  return 'outro';
}

const CARTA_PREFIXES = [
  /^carta\s+de\s+autorizacao\s+(?:para\s+)?comercializacao\s+/i,
  /^carta\s+de\s+comercializacao\s+/i,
  /^carta\s+comercializacao\s+/i,
  /^carta\s+de\s+distribuicao\s+/i,
  /^carta\s+distribuicao\s+/i,
  /^credenciamento\s+(?:para\s+)?(?:comercializacao\s+)?/i,
  /^declaracao\s+de\s+comercializacao\s+/i,
  /^declaracao\s+/i,
];

/** dd.MM.yy / dd.MM.yyyy / dd-MM-yyyy / 26fev26 — só para limpar o rótulo. */
const DATE_TOKEN =
  /(?<!\d)(\d{2})[.\-](\d{2})[.\-](\d{4}|\d{2})(?!\d)|\b\d{1,2}[a-z]{3}\d{2,4}\b|\b\d{6}\b/gi;

const WEAK_CARTA_LABEL =
  /^(assinada?|carta|credenciamento|declaracao|encerramento|distribuicao|autorizacao|comercializacao|\d+)/;

/**
 * Fabricante a partir do nome da carta. Não inventa data; só corta prefixo,
 * datas e sufixos da empresa ("QL MED", "Assin", "QL" solto no fim).
 */
export function cartaLabelFromFileName(fileName: string): string {
  const base = fileName.normalize('NFC').replace(/\.[^.]+$/u, '');
  let cut = fold(base).replace(/[_-]+/g, ' ').replace(DATE_TOKEN, ' ');
  for (const prefix of CARTA_PREFIXES) {
    cut = cut.replace(prefix, '');
  }
  cut = cut
    .replace(/\bql\s*med\b/g, ' ')
    .replace(/\bqlmed\b/g, ' ')
    .replace(/\bassin(?:ada)?\b/g, ' ')
    .replace(/\bnao\s+exclusiva\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bql$/g, '')
    .trim();
  // «Assin - CARDIOVENT» → preferir o token depois do último traço/hífen residual
  const dashParts = cut.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    const last = dashParts[dashParts.length - 1];
    if (last && !WEAK_CARTA_LABEL.test(last)) cut = last;
  }
  if (!cut) return base.trim() || fileName;
  return cut.toUpperCase();
}

/** Rótulo fraco demais para ser o fabricante (ASSINADA, CARTA DISTRIBUICAO…). */
export function isWeakCartaLabel(label: string): boolean {
  const f = fold(label).trim();
  if (!f || f.length < 3) return true;
  if (WEAK_CARTA_LABEL.test(f)) return true;
  if (/\b(comercializacao|autorizacao|distribuicao|encerramento|declaracao)\b/.test(f)) return true;
  return false;
}

/**
 * Fabricante no texto do PDF: marca, cabeçalho ou «A CARDIOVENT … LTDA».
 * Nunca devolve QL MED (é a própria empresa).
 */
export function cartaManufacturerFromPdf(text: string): string | null {
  const hay = fold(text).slice(0, 9000);
  if (!hay) return null;

  const reject = (name: string): boolean => {
    const f = fold(name);
    return (
      !f ||
      f.length < 3 ||
      f.includes('ql med') ||
      f.includes('materiais hospital') ||
      WEAK_CARTA_LABEL.test(f)
    );
  };

  const clean = (raw: string): string | null => {
    let n = raw
      .replace(/\s+/g, ' ')
      .replace(/\b(ltda|epp|s\.?a\.?|me)\b/gi, ' ')
      .replace(/[.,;:]+$/g, '')
      .trim();
    if (reject(n)) return null;
    // Fica com as 1–4 primeiras palavras significativas
    const parts = n.split(/\s+/).filter(Boolean).slice(0, 4);
    n = parts.join(' ');
    if (reject(n)) return null;
    return n.toUpperCase();
  };

  const marca = /\bmarca\s+([a-z0-9][a-z0-9 .&-]{1,40}?)(?:\s+(?:no|na|cuja|em|ltda|,)|\s*$)/.exec(hay);
  if (marca?.[1]) {
    const got = clean(marca[1]);
    if (got) return got;
  }

  const aIssuer =
    /\ba\s+([a-z][a-z0-9]+(?:\s+[a-z0-9]+){0,3})\s+(?:comercio|industria|equipamentos|medical|technology|importacao)\b/.exec(
      hay,
    );
  if (aIssuer?.[1]) {
    const got = clean(aIssuer[1]);
    if (got) return got;
  }

  const letterhead = /^(?:www\.[^\s]+\s+(?:\([^)]*\)\s+)?)?([a-z][a-z0-9]+(?:\s+[a-z0-9]+){0,3})\b/.exec(
    hay.replace(/^\W+/, ''),
  );
  if (letterhead?.[1] && !reject(letterhead[1])) {
    const got = clean(letterhead[1]);
    if (got && !/^(RUA|AV|AVENIDA|CEP|CNPJ|TEL|WWW)\b/.test(got)) return got;
  }

  // Cath-Care / letterhead mid-document
  const midHead =
    /\b((?:cath[\s-]*care|techimport|terumo|osteomed|gabmed|vicca|biomedical|livanova|politec|ossea|vicare|cardio\s+medical)[a-z0-9\s-]{0,20})\b/.exec(
      hay,
    );
  if (midHead?.[1]) {
    const got = clean(midHead[1].replace(/-/g, ' '));
    if (got) return got;
  }

  return null;
}

/** Nome do fabricante: PDF quando o ficheiro é genérico; senão o nome. */
export function resolveCartaManufacturer(fileName: string, pdfText = ''): string {
  const fromName = cartaLabelFromFileName(fileName);
  if (!isWeakCartaLabel(fromName)) return fromName;
  const fromPdf = cartaManufacturerFromPdf(pdfText);
  if (fromPdf) return fromPdf;
  return fromName;
}

export function cartaManufacturerKey(fileName: string): string {
  return fold(cartaLabelFromFileName(fileName));
}

/**
 * Ruído fiscal — nome ou texto. Inclui "NF DOC", DANFE, chave de acesso.
 * Mensagens de "carta de autorização" com DANFE anexado caíam aqui antes
 * só pelo assunto; o nome "NF DOC MED….pdf" não tinha "nfe" e passava.
 */
const CARTA_NOISE =
  /\b(danfe|nf-?e\b|nfe\b|ct-?e\b|boleto|ordem de compra|xml da nfe|nota fiscal|chave de acesso|documento auxiliar da nota)\b|\bnf\s+(doc|n[oº°.]|serie|eletronica)\b/;

/** NF-e / DANFE / boleto — nunca é carta, mesmo com assunto enganoso. */
export function looksLikeNotaFiscalDocument(fileName: string, textSnippet = ''): boolean {
  const hay = fold(`${fileName} ${textSnippet.slice(0, 6000)}`);
  if (CARTA_NOISE.test(hay)) return true;
  // Nome tipo "NF DOC MED 81.472.pdf" / "NF-123.pdf"
  if (/^\s*nf[\s._-]/i.test(fileName.replace(/^.*[/\\]/, ''))) return true;
  return false;
}

/**
 * Anexo/assunto de carta de comercialização (FR-044). O texto do PDF entra
 * só como apoio: DANFE e NF-e nunca passam, mesmo que o assunto cite "carta".
 */
export function isCartaComercializacaoCandidate(
  fileName: string,
  subject = '',
  textSnippet = '',
): boolean {
  if (looksLikeNotaFiscalDocument(fileName, textSnippet)) return false;
  const hay = fold(`${fileName} ${subject} ${textSnippet.slice(0, 4000)}`);
  const hasCarta = /\bcarta\b/.test(hay);
  const hasTema =
    /comercializ/.test(hay) ||
    /autoriza\w*.{0,40}(comercializ|distribui)/.test(hay) ||
    /distribuidor autoriz/.test(hay) ||
    /representa\w*.{0,20}comercial/.test(hay) ||
    /autoriza\w*.{0,80}distribuir/.test(hay);
  return hasCarta && hasTema;
}

function classifySocietario(fileName: string): CompanyDocumentKind {
  const file = fold(fileName);
  if (file.includes('constituicao') && file.includes('alteracao')) return 'contrato_social_consolidado';
  if (file.includes('alteracao')) return 'contrato_social_alteracao';
  if (file.includes('constituicao')) return 'contrato_social_constituicao';
  // Nome genérico (CONTRATO SOCIAL.pdf) sem constituição/alteração: consolidado vigente.
  if (file.includes('contrato')) return 'contrato_social_consolidado';
  return 'outro';
}

/** Linha já persistida como `outro` (pré-FR-036) volta a aparecer no card societário. */
export function effectiveSocietarioKind(
  kind: CompanyDocumentKind,
  fileName: string,
): CompanyDocumentKind {
  if (kind !== 'outro') return kind;
  return classifySocietario(fileName);
}

function classifyBasicos(fileName: string): CompanyDocumentKind {
  const file = fold(fileName);
  if (file.includes('cartao cnpj')) return 'cartao_cnpj';
  if (file.includes('inscricao municipal')) return 'inscricao_municipal';
  if (file.includes('inscricao estadual')) return 'inscricao_estadual';
  if (file.includes('siscomex')) return 'siscomex_radar';
  if (file.includes('e-cjur') || file.includes('ecjur')) return 'cadastro_ecjur';
  if (file.includes('dados cadastrais')) return 'dados_cadastrais';
  return 'outro';
}

export function classifyDocument(
  folderName: string,
  fileName: string,
  category: DocumentosCategory = 'certidao',
): CompanyDocumentKind {
  if (category === 'sanitaria') return classifySanitaria(fileName);
  if (category === 'carta') return 'carta_comercializacao';
  if (category === 'societario') return classifySocietario(fileName);
  if (category === 'basicos') return classifyBasicos(fileName);
  if (category === 'balanco') return 'balanco_anual';
  return classifyCertidao(folderName, fileName);
}
