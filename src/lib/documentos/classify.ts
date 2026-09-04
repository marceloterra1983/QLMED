import type { CompanyDocumentKind } from '@prisma/client';
import { CERTIDAO_FOLDER } from './constants';

/** NFC + sem acento + minúsculas — nomes do Graph chegam em NFD. */
function fold(value: string): string {
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

export function classifyDocument(folderName: string, fileName: string): CompanyDocumentKind {
  const folder = fold(folderName);
  const file = fold(fileName);

  if (folder === FOLDER_FEDERAIS) {
    return file.includes(TOKEN_TRIBUNAL) ? 'outro' : 'cnd_federal';
  }
  if (folder === FOLDER_FGTS) return 'crf_fgts';
  if (folder === FOLDER_CNDT) return 'cndt';
  if (folder === FOLDER_ESTADUAIS) {
    if (file.includes(TOKEN_MATO_GROSSO) && !file.includes(TOKEN_SUL)) return 'outro';
    return 'cnd_estadual_ms';
  }
  if (folder === FOLDER_MUNICIPAIS) {
    if (file.includes(TOKEN_MOBILIARIO)) return 'cnd_municipal_mobiliario';
    if (file.includes(TOKEN_GERAIS)) return 'cnd_municipal_gerais';
    return 'outro';
  }
  return 'outro';
}
