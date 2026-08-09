/**
 * Compara o CNAE principal do emitente com os tipos de produto que ele vende.
 * Usado só no fornecedor: um CNAE de instrumentos médicos que só vende alimentos
 * costuma indicar cadastro errado ou nota de terceiro.
 */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

const RULES = [
  {
    codes: ['4645', '3250', '2660'],
    descKeywords: ['INSTRUMENTO', 'MEDICO', 'HOSPITALAR', 'CIRURGICO'],
    typeKeywords: ['MEDIC', 'HOSP', 'CIRUR', 'CARDIO', 'VALVUL', 'IMPLANT', 'CATETER', 'PROTES'],
    label: 'instrumentos medicos/hospitalares',
  },
  {
    codes: ['4644', '2123', '2121'],
    descKeywords: ['FARMACEUTIC', 'MEDICAMENT'],
    typeKeywords: ['FARMAC', 'MEDICAM', 'DROGA', 'INSUMO'],
    label: 'produtos farmaceuticos',
  },
  {
    codes: ['4637', '4639'],
    descKeywords: ['ALIMENT', 'BEBIDA'],
    typeKeywords: ['ALIMENT', 'BEBID', 'NUTRI'],
    label: 'alimentos/bebidas',
  },
];

export function checkCnaeMismatch(
  cnaeCode: string | null | undefined,
  cnaeDescription: string | null | undefined,
  productTypes: string[],
): string | null {
  if (!cnaeCode && !cnaeDescription) return null;
  if (productTypes.length === 0) return null;

  const desc = normalize(cnaeDescription || '');
  const code = (cnaeCode || '').replace(/\D/g, '');
  const normalizedTypes = productTypes.map(normalize);

  for (const rule of RULES) {
    const matchesCnae = rule.codes.some((c) => code.startsWith(c))
      || rule.descKeywords.some((kw) => desc.includes(kw));
    if (!matchesCnae) continue;
    if (normalizedTypes.some((t) => rule.typeKeywords.some((kw) => t.includes(kw)))) return null;
    return `CNAE indica ${rule.label}, mas tipos vendidos nao correspondem: ${productTypes.join(', ')}`;
  }

  return null;
}
