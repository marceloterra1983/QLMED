/**
 * IEEE-754 + EPSILON não é half-up — sobretudo em negativos (ex.: -4.995 → -4.99).
 * Decimal aplica ROUND_HALF_UP em 2 casas sem o viés do number.
 */
import { Decimal } from '@prisma/client/runtime/client';

export function roundMoney(value: number): number {
  return new Decimal(value)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}
