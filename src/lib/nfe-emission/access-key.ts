/** Chave de acesso NF-e 44 dígitos (MOC). */

function onlyDigits(value: string, size: number): string {
  const digits = value.replace(/\D/g, '');
  return digits.padStart(size, '0').slice(-size);
}

export function nfeAccessKeyCheckDigit(first43: string): string {
  if (!/^\d{43}$/.test(first43)) {
    throw new Error('Base da chave deve ter 43 dígitos');
  }
  const weights = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 43; i += 1) {
    sum += Number(first43[i]) * weights[i];
  }
  const mod = sum % 11;
  const dv = mod === 0 || mod === 1 ? 0 : 11 - mod;
  return String(dv);
}

export function buildNfeAccessKey(input: {
  cUf: string;
  issueDate: Date;
  cnpj: string;
  series: string;
  number: string;
  tpEmis?: string;
  cNf?: string;
}): string {
  const year = String(input.issueDate.getFullYear()).slice(-2);
  const month = String(input.issueDate.getMonth() + 1).padStart(2, '0');
  const cUf = onlyDigits(input.cUf, 2);
  const aamm = `${year}${month}`;
  const cnpj = onlyDigits(input.cnpj, 14);
  const mod = '55';
  const serie = onlyDigits(input.series, 3);
  const nNF = onlyDigits(input.number, 9);
  const tpEmis = onlyDigits(input.tpEmis || '1', 1);
  const cNf = onlyDigits(input.cNf || String(Math.floor(Math.random() * 1e8)), 8);
  const first43 = `${cUf}${aamm}${cnpj}${mod}${serie}${nNF}${tpEmis}${cNf}`;
  return `${first43}${nfeAccessKeyCheckDigit(first43)}`;
}

export function nextInvoiceNumber(existing: Array<string | number>): number {
  let max = 0;
  for (const value of existing) {
    const n = typeof value === 'number' ? value : Number(String(value).replace(/\D/g, ''));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}
