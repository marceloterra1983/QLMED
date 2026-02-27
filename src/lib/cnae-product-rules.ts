/**
 * CNAE x Product type cross-check rules.
 * Maps CNAE groups to expected product types.
 */

export interface CnaeMismatch {
  cnaeCode: string;
  cnaeDescription: string;
  expectedCategories: string[];
  actualTypes: string[];
  mismatchedTypes: string[];
}

// Map of CNAE division/group → expected product type keywords
const CNAE_PRODUCT_MAP: Array<{
  cnaePrefixes: string[];
  cnaeKeywords: string[];
  expectedTypeKeywords: string[];
  label: string;
}> = [
  {
    cnaePrefixes: ['4645', '3250', '2660'],
    cnaeKeywords: ['instrumento', 'medico', 'hospitalar', 'cirurgico', 'odontologico', 'laboratorio', 'protese'],
    expectedTypeKeywords: ['MEDIC', 'HOSP', 'CIRUR', 'LABOR', 'PROTES', 'CARDIO', 'VALVUL', 'ORTOPED', 'IMPLANT', 'CATETER', 'MARCA-PASSO'],
    label: 'Instrumentos medicos/hospitalares',
  },
  {
    cnaePrefixes: ['4644', '2123', '2121'],
    cnaeKeywords: ['farmaceutic', 'medicament', 'droga'],
    expectedTypeKeywords: ['FARMAC', 'MEDICAM', 'DROGA', 'INSUMO'],
    label: 'Produtos farmaceuticos',
  },
  {
    cnaePrefixes: ['4641', '4649'],
    cnaeKeywords: ['tecido', 'vestuario', 'roupa', 'textil'],
    expectedTypeKeywords: ['TECID', 'VESTUAR', 'ROUPA', 'TEXTIL', 'CONFEC'],
    label: 'Textil/vestuario',
  },
  {
    cnaePrefixes: ['4637', '4639'],
    cnaeKeywords: ['aliment', 'bebida', 'genero'],
    expectedTypeKeywords: ['ALIMENT', 'BEBID', 'NUTRI'],
    label: 'Alimentos/bebidas',
  },
  {
    cnaePrefixes: ['4651', '4652'],
    cnaeKeywords: ['informatic', 'computad', 'eletronico'],
    expectedTypeKeywords: ['INFORM', 'COMPUT', 'ELETRON', 'SOFTW', 'HARDWARE'],
    label: 'Informatica/eletronica',
  },
  {
    cnaePrefixes: ['4661', '4662', '4663'],
    cnaeKeywords: ['maquina', 'equipamento', 'industrial'],
    expectedTypeKeywords: ['MAQUIN', 'EQUIP', 'INDUSTR', 'FERRAM'],
    label: 'Maquinas/equipamentos',
  },
];

function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

/**
 * Check if a supplier's CNAE is consistent with the product types they sell.
 * Returns null if no mismatch detected or CNAE is not in our rules.
 */
export function checkCnaeProductMismatch(
  cnaeCode: string | null | undefined,
  cnaeDescription: string | null | undefined,
  productTypes: string[],
): CnaeMismatch | null {
  if (!cnaeCode && !cnaeDescription) return null;
  if (productTypes.length === 0) return null;

  const code = (cnaeCode || '').replace(/\D/g, '');
  const desc = normalizeText(cnaeDescription || '');

  // Find matching CNAE rule
  let matchedRule: typeof CNAE_PRODUCT_MAP[number] | null = null;

  for (const rule of CNAE_PRODUCT_MAP) {
    // Match by prefix
    if (code && rule.cnaePrefixes.some((p) => code.startsWith(p))) {
      matchedRule = rule;
      break;
    }
    // Match by keyword in description
    if (desc && rule.cnaeKeywords.some((kw) => desc.includes(normalizeText(kw)))) {
      matchedRule = rule;
      break;
    }
  }

  if (!matchedRule) return null;

  // Check if any of the product types match the expected keywords
  const normalizedTypes = productTypes.map(normalizeText);
  const hasMatch = normalizedTypes.some((t) =>
    matchedRule!.expectedTypeKeywords.some((kw) => t.includes(kw))
  );

  if (hasMatch) return null; // CNAE matches product types

  // Mismatch found: products don't match CNAE
  const mismatchedTypes = productTypes.filter((t) => {
    const nt = normalizeText(t);
    return !matchedRule!.expectedTypeKeywords.some((kw) => nt.includes(kw));
  });

  return {
    cnaeCode: code,
    cnaeDescription: cnaeDescription || '',
    expectedCategories: [matchedRule.label],
    actualTypes: productTypes,
    mismatchedTypes,
  };
}
