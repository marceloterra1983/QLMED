/**
 * SPEC-047 — itens fora do escopo de vínculo Spica (decisão do operador).
 * Não inventa produto; só marca SKIPPED_* para sair da fila de pendências.
 */
import { normalizeCnpj, normalizeSupplierName } from './normalize';

/** RCA Saúde — histórico antigo; operador autorizou desconsiderar. */
export const SKIP_LEGACY_CNPJS = new Set<string>([
  '11352270000188', // RCA SAUDE
]);

/**
 * Fornecedores não-médicos (autopeças, tintas, telecom, hotelaria, etc.).
 * Lista medida no qlmed-db em 2026-09-05 entre os 959 pendentes.
 */
export const SKIP_NON_MEDICAL_CNPJS = new Set<string>([
  '03583836000154', // Kampai Motors
  '01869728000117', // Casa das Cores / tintas
  '01049149000128', // Autobel Veículos
  '02558157013221', // Telefonica
  '81071623001200', // Deville Hotéis
  '42506618000500', // Danicazipco
  '20655018000210', // Manflex parafusos
  '26371358000114', // Pala Pneus
  '35358594000272', // Santana auto peças
  '37491465000100', // Auto Vidros Malvcar
  '02841086000100', // Alpharoll Rolamentos
  '54601790000190', // CG Pneus
  '20357708000101', // Portal Pneus
  '05121947000174', // Alerta monitoramento
  '36822674000119', // Marfi Oeste
]);

const NON_MEDICAL_NAME_RE =
  /\b(motor|veiculo|veículos|pneu|tinta|tintas|hoteis|hotel|telefonica|telecom|rolamento|auto\s*pecas|vidros|parafusos\s+e\s+ferramentas|sistemas\s+construtivos|alerta\s+sistema)\b/i;

export type SkipStrategy = 'SKIPPED_NON_MEDICAL' | 'SKIPPED_LEGACY';

export function isSkippedStrategy(strategy: string | null | undefined): boolean {
  return !!strategy && strategy.startsWith('SKIPPED_');
}

/**
 * Classifica CNPJ/nome como fora de escopo. DOC MED (66877184000180) NÃO entra:
 * são 8 notas distintas (2023–2025), não uma NF isolada.
 */
export function classifyOutOfScope(input: {
  supplierCnpj: string;
  supplierName?: string | null;
}): SkipStrategy | null {
  const cnpj = normalizeCnpj(input.supplierCnpj);
  if (SKIP_LEGACY_CNPJS.has(cnpj)) return 'SKIPPED_LEGACY';
  if (SKIP_NON_MEDICAL_CNPJS.has(cnpj)) return 'SKIPPED_NON_MEDICAL';
  const name = input.supplierName || '';
  if (name && NON_MEDICAL_NAME_RE.test(name)) {
    // Evita falso positivo em nomes médicos que contenham substring genérica.
    const norm = normalizeSupplierName(name);
    if (/\b(med|saude|hospital|labcor|biomed|cirurg|implante|ortoped)\b/.test(norm)) {
      return null;
    }
    return 'SKIPPED_NON_MEDICAL';
  }
  return null;
}
