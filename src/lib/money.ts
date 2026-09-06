/**
 * IEEE-754 + EPSILON não é half-up — sobretudo em negativos (ex.: -4.995 → -4.99).
 * Decimal (client-safe) aplica ROUND_HALF_UP em 2 casas; não importar o runtime Node do Prisma.
 * Borda HTTP continua `number`; persistência tipada usa Prisma.Decimal.
 */
import { Decimal } from '@prisma/client-runtime-utils';

function toMoney(value: number): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function roundMoney(value: number): number {
  return toMoney(value).toNumber();
}

export function addMoney(a: number, b: number): number {
  return toMoney(a).plus(toMoney(b)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function sumMoney(values: number[]): number {
  return values.reduce((sum, value) => addMoney(sum, value), 0);
}

/** Parser IMPCG trabalha em centavos inteiros; persistência é Decimal. */
export function centsToDecimal(cents: number): Decimal {
  if (!Number.isInteger(cents)) {
    throw new Error('cents must be an integer');
  }
  return new Decimal(cents).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function formatMoneyDecimal(value: Decimal): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function decimalToCents(value: Decimal): number {
  return new Decimal(value)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * Formata qualquer valor monetário (Decimal, number, string, null, undefined)
 * em representação textual de 2 casas com ROUND_HALF_UP.
 */
export function formatCurrency(value: unknown): string {
  if (value instanceof Decimal) {
    return formatMoneyDecimal(value);
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    return formatMoneyDecimal(new Decimal(value.toString()));
  }
  return formatMoneyDecimal(new Decimal(value == null || value === '' ? 0 : String(value)));
}
