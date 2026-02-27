/**
 * Compare addresses from XML (NF-e) vs Receita Federal (BrasilAPI).
 * Normalizes both and returns field-by-field divergences.
 */

export interface AddressDivergence {
  field: string;
  label: string;
  xmlValue: string;
  apiValue: string;
}

interface AddressFields {
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
}

/**
 * Normalize a string for comparison: uppercase, remove accents, trim, collapse spaces.
 */
function normalize(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.,\-\/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ABBREVIATIONS: Record<string, string[]> = {
  'RUA': ['R', 'RUA'],
  'AVENIDA': ['AV', 'AVE', 'AVEN', 'AVENIDA'],
  'RODOVIA': ['ROD', 'RODOVIA'],
  'TRAVESSA': ['TV', 'TRAV', 'TRAVESSA'],
  'ALAMEDA': ['AL', 'ALAMEDA'],
  'PRACA': ['PC', 'PCA', 'PRACA'],
  'ESTRADA': ['EST', 'ESTR', 'ESTRADA'],
  'LARGO': ['LG', 'LARGO'],
  'VILA': ['VL', 'VILA'],
  'JARDIM': ['JD', 'JDM', 'JARDIM'],
  'CONDOMINIO': ['COND', 'CONDOMINIO'],
  'CONJUNTO': ['CJ', 'CONJ', 'CONJUNTO'],
  'CENTRO': ['CENTRO', 'CTR'],
  'SAO': ['S', 'SAO', 'STO', 'SANTO'],
  'SANTA': ['STA', 'SANTA'],
  'NOSSA SENHORA': ['N S', 'NS', 'NOSSA SENHORA'],
};

function expandAbbreviations(text: string): string {
  let result = normalize(text);
  for (const [canonical, variants] of Object.entries(ABBREVIATIONS)) {
    for (const v of variants) {
      // Match whole word only
      const regex = new RegExp(`\\b${v}\\b`, 'g');
      result = result.replace(regex, canonical);
    }
  }
  return result;
}

function normalizeCep(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

function fieldsMatch(a: string, b: string): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const na = expandAbbreviations(a);
  const nb = expandAbbreviations(b);
  if (na === nb) return true;
  // Fuzzy: one contains the other
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

/**
 * Compare XML address with API address.
 * Returns list of divergent fields (empty = addresses match).
 */
export function compareAddresses(
  xmlAddr: AddressFields | null | undefined,
  apiAddr: AddressFields | null | undefined,
): AddressDivergence[] {
  if (!xmlAddr || !apiAddr) return [];

  const divergences: AddressDivergence[] = [];

  const fields: Array<{ key: keyof AddressFields; label: string; useCep?: boolean }> = [
    { key: 'logradouro', label: 'Logradouro' },
    { key: 'numero', label: 'Numero' },
    { key: 'bairro', label: 'Bairro' },
    { key: 'municipio', label: 'Municipio' },
    { key: 'uf', label: 'UF' },
    { key: 'cep', label: 'CEP', useCep: true },
  ];

  for (const { key, label, useCep } of fields) {
    const xmlVal = xmlAddr[key] || '';
    const apiVal = apiAddr[key] || '';

    if (!xmlVal && !apiVal) continue;

    let match: boolean;
    if (useCep) {
      match = normalizeCep(xmlVal) === normalizeCep(apiVal);
    } else {
      match = fieldsMatch(xmlVal, apiVal);
    }

    if (!match) {
      divergences.push({
        field: key,
        label,
        xmlValue: xmlVal || '(vazio)',
        apiValue: apiVal || '(vazio)',
      });
    }
  }

  return divergences;
}
