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
