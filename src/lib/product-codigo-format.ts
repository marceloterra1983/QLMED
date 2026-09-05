/** Largura canônica do código interno (Spica e novos códigos do portal). */
export const PRODUCT_CODIGO_WIDTH = 6;

/** Normaliza dígitos de um código interno; retorna null se vazio. */
export function normalizeCodigoDigits(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

/** Pad à esquerda com zeros até PRODUCT_CODIGO_WIDTH (mínimo 6). */
export function formatCodigo(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`codigo invalido: ${n}`);
  }
  const width = Math.max(PRODUCT_CODIGO_WIDTH, String(Math.trunc(n)).length);
  return String(Math.trunc(n)).padStart(width, '0');
}

/** Pad Spica/código já conhecido para 6 dígitos (só dígitos). */
export function padSpicaCodigo(value: string | null | undefined): string | null {
  const digits = normalizeCodigoDigits(value);
  if (!digits) return null;
  return formatCodigo(Number(digits));
}
