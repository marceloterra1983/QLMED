const CFOP_TAG_BY_CODE: Record<string, string> = {
  '5102': 'Venda',
  '5917': 'Consignação',
  '6102': 'Venda',
  '6101': 'Venda',
  '5912': 'Demonstração',
  '1918': 'Dev. Consig.',
  '6917': 'Consignação',
  '3102': 'Compra Importação',
  '5949': 'Outras Saídas',
  '1202': 'Dev. Venda',
  '6918': 'Dev. Consig.',
  '2919': 'Dev. Consig.',
  '6108': 'Venda',
  '5908': 'Comodato',
  '2918': 'Dev. Consig.',
  '5910': 'Bonificação',
  '2202': 'Dev. Venda',
  '6912': 'Demonstração',
  '6949': 'Outras Saídas',
  '6554': 'Uso Externo Ativo',
  '5405': 'Venda',
  '6915': 'Conserto',
  '5554': 'Uso Externo Ativo',
  '6908': 'Comodato',
  '2949': 'Outras Entradas',
  '6202': 'Dev. Compra',
  '6913': 'Ret. Demonstração',
  '2909': 'Ret. Comodato',
  '1949': 'Outras Entradas',
  '2554': 'Ret. Ativo',
  '1909': 'Ret. Comodato',
  '5909': 'Ret. Comodato',
  '5911': 'Amostra',
  '5551': 'Venda',
  '1908': 'Comodato',
  '1554': 'Ret. Ativo',
  '6555': 'Dev. Ativo Terceiro',
  '7202': 'Dev. Compra',
};

const CFOP_TAG_OPTIONS = Array.from(new Set(Object.values(CFOP_TAG_BY_CODE)));

export function getCfopTagByCode(cfop?: string | null): string | null {
  if (!cfop) return null;
  return CFOP_TAG_BY_CODE[cfop] || null;
}

export function getCfopTagOptions(): string[] {
  return CFOP_TAG_OPTIONS;
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
