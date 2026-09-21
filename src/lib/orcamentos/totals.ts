import { Decimal } from '@prisma/client-runtime-utils';

const MONEY = 2;
const QTY = 4;
const HALF_UP = Decimal.ROUND_HALF_UP;

export type QuoteLineInput = {
  quantity: string | number;
  unitPrice: string | number;
  discount?: string | number;
};

function toQty(value: string | number): Decimal {
  return new Decimal(value).toDecimalPlaces(QTY, HALF_UP);
}

function toMoney(value: string | number): Decimal {
  return new Decimal(value).toDecimalPlaces(MONEY, HALF_UP);
}

export function lineTotalOf(line: QuoteLineInput): Decimal {
  const qty = toQty(line.quantity);
  const price = toMoney(line.unitPrice);
  const discount = toMoney(line.discount ?? 0);
  const gross = qty.mul(price).toDecimalPlaces(MONEY, HALF_UP);
  const net = gross.minus(discount).toDecimalPlaces(MONEY, HALF_UP);
  if (qty.lte(0)) {
    throw new Error('Quantidade deve ser maior que zero');
  }
  if (price.lt(0) || discount.lt(0)) {
    throw new Error('Preço e desconto não podem ser negativos');
  }
  if (discount.gt(gross)) {
    throw new Error('Desconto maior que o total da linha');
  }
  if (net.lt(0)) {
    throw new Error('Total da linha negativo');
  }
  return net;
}

export function quoteTotalsOf(
  lines: QuoteLineInput[],
  freight: string | number = 0,
): { subtotal: Decimal; freight: Decimal; total: Decimal; lineTotals: Decimal[] } {
  if (lines.length === 0) {
    throw new Error('Informe ao menos um item');
  }
  const lineTotals = lines.map((line) => lineTotalOf(line));
  const subtotal = lineTotals
    .reduce((sum, value) => sum.plus(value), new Decimal(0))
    .toDecimalPlaces(MONEY, HALF_UP);
  const freightMoney = toMoney(freight);
  if (freightMoney.lt(0)) {
    throw new Error('Frete não pode ser negativo');
  }
  const total = subtotal.plus(freightMoney).toDecimalPlaces(MONEY, HALF_UP);
  return { subtotal, freight: freightMoney, total, lineTotals };
}

export function formatQuoteNumber(number: number): string {
  if (!Number.isInteger(number) || number < 1) {
    throw new Error('Número de orçamento inválido');
  }
  return String(number).padStart(8, '0');
}

export function moneyText(value: { toString(): string } | string | number): string {
  return new Decimal(String(value)).toDecimalPlaces(MONEY, HALF_UP).toFixed(MONEY);
}
