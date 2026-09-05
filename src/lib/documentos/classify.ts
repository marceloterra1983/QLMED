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
  /^carta\s+de\s+autorizacao\s+comercializacao\s+/i,
  /^carta\s+de\s+comercializacao\s+/i,
  /^carta\s+comercializacao\s+/i,
];

/** dd.MM.yy / dd.MM.yyyy / dd-MM-yyyy / 26fev26 — só para limpar o rótulo. */
const DATE_TOKEN =
  /(?<!\d)(\d{2})[.\-](\d{2})[.\-](\d{4}|\d{2})(?!\d)|\b\d{1,2}[a-z]{3}\d{2,4}\b/gi;

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
    .replace(/\bassin\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bql$/g, '')
    .trim();
  if (!cut) return base.trim() || fileName;
  return cut.toUpperCase();
}

export function cartaManufacturerKey(fileName: string): string {
  return fold(cartaLabelFromFileName(fileName));
}

function classifySocietario(fileName: string): CompanyDocumentKind {
  const file = fold(fileName);
  if (file.includes('constituicao') && file.includes('alteracao')) return 'contrato_social_consolidado';
  if (file.includes('alteracao')) return 'contrato_social_alteracao';
  if (file.includes('constituicao')) return 'contrato_social_constituicao';
  return 'outro';
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
