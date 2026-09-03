const CFOP_TAG_BY_CODE: Record<string, string> = {
  // Saídas — Vendas
  '5101': 'Venda',
  '5102': 'Venda',
  '5103': 'Venda',
  '5104': 'Venda',
  '5105': 'Venda',
  '5106': 'Venda',
  '5107': 'Venda',
  '5108': 'Venda',
  '5109': 'Venda',
  '5110': 'Venda',
  '5114': 'Venda',
  '5115': 'Venda',
  '5401': 'Venda',
  '5403': 'Venda',
  '5405': 'Venda',
  '5551': 'Venda',
  '6101': 'Venda',
  '6102': 'Venda',
  '6103': 'Venda',
  '6104': 'Venda',
  '6105': 'Venda',
  '6106': 'Venda',
  '6107': 'Venda',
  '6108': 'Venda',
  '6109': 'Venda',
  '6110': 'Venda',
  '6114': 'Venda',
  '6115': 'Venda',
  '6401': 'Venda',
  '6403': 'Venda',
  '6405': 'Venda',
  '6551': 'Venda',
  '7101': 'Venda',
  '7102': 'Venda',
  // Saídas — Outros
  '5908': 'Comodato',
  '5909': 'Ret. Comodato',
  '5910': 'Bonificação',
  '5911': 'Amostra',
  '5912': 'Demonstração',
  '5916': 'Retorno Consig.',
  '5917': 'Consignação',
  '5918': 'Dev. Consig.',
  '5949': 'Outras Saídas',
  '5554': 'Uso Externo Ativo',
  '6202': 'Dev. Compra',
  '6554': 'Uso Externo Ativo',
  '6555': 'Dev. Ativo Terceiro',
  '6908': 'Comodato',
  '6909': 'Ret. Comodato',
  '6910': 'Bonificação',
  '6911': 'Amostra',
  '6912': 'Demonstração',
  '6913': 'Ret. Demonstração',
  '6915': 'Conserto',
  '6916': 'Retorno Consig.',
  '6917': 'Consignação',
  '6918': 'Dev. Consig.',
  '6949': 'Outras Saídas',
  '7202': 'Dev. Compra',
  // Entradas — Compras
  '1101': 'Compra',
  '1102': 'Compra',
  '1401': 'Compra',
  '1403': 'Compra',
  '2101': 'Compra',
  '2102': 'Compra',
  '2401': 'Compra',
  '2403': 'Compra',
  '3101': 'Compra Importação',
  '3102': 'Compra Importação',
  // Entradas — Bonificação
  '1910': 'Bonificação',
  '2910': 'Bonificação',
  // Entradas — Outros
  '1202': 'Dev. Venda',
  '1554': 'Ret. Ativo',
  '1908': 'Comodato',
  '1909': 'Ret. Comodato',
  '1911': 'Amostra',
  '1912': 'Demonstração',
  '1916': 'Retorno Consig.',
  '1917': 'Consignação',
  '1918': 'Dev. Consig.',
  '1949': 'Outras Entradas',
  '2202': 'Dev. Venda',
  '2554': 'Ret. Ativo',
  '2909': 'Ret. Comodato',
  '2911': 'Amostra',
  '2912': 'Demonstração',
  '2916': 'Retorno Consig.',
  '2917': 'Consignação',
  '2918': 'Dev. Consig.',
  '2919': 'Dev. Consig.',
  '2949': 'Outras Entradas',
};

const CFOP_TAG_OPTIONS = Array.from(new Set(Object.values(CFOP_TAG_BY_CODE)));

export function getCfopTagByCode(cfop?: string | null): string | null {
  if (!cfop) return null;
  const clean = cfop.trim();
  if (CFOP_TAG_BY_CODE[clean]) return CFOP_TAG_BY_CODE[clean];
  // Fallback canônico baseado em prefixos da tabela fiscal brasileira (SPED/SEFAZ)
  if (/^[567]1\d{2}$/.test(clean) || /^[56]40[1-5]$/.test(clean)) return 'Venda';
  if (/^[12]10[1-9]$/.test(clean) || /^[12]40[1-9]$/.test(clean)) return 'Compra';
  if (/^310[1-9]$/.test(clean)) return 'Compra Importação';
  return null;
}

export function getCfopTagOptions(): string[] {
  return CFOP_TAG_OPTIONS;
}

/**
 * Returns all CFOP codes that map to the given tag.
 * E.g. getCfopCodesByTag('Venda') => ['5102', '5405', '5551', '6101', '6102', '6108']
 */
export function getCfopCodesByTag(tag: string): string[] {
  return Object.entries(CFOP_TAG_BY_CODE)
    .filter(([, t]) => t === tag)
    .map(([code]) => code);
}

/**
 * CFOPs starting with 3 are international entries (importação).
 * These invoices are issued by the company but represent product entries.
 */
export function isImportEntryCfop(cfop: string | null | undefined): boolean {
  return !!cfop && cfop.startsWith('3');
}

export function extractFirstCfop(xmlContent?: string | null): string | null {
  if (!xmlContent) return null;
  const match = xmlContent.match(/<CFOP>\s*(\d{4})\s*<\/CFOP>/i);
  return match?.[1] || null;
}
