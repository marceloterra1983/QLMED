import { describe, expect, it } from 'vitest';
import { Decimal } from '@prisma/client-runtime-utils';
import {
  addMoney,
  centsToDecimal,
  decimalToCents,
  formatCurrency,
  formatMoneyDecimal,
  formatMoneyDecimalString,
  roundMoney,
  sumMoney,
} from '@/lib/money';

describe('money', () => {
  it('roundMoney arredonda half-up em 2 casas', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(1.999)).toBe(2);
    expect(roundMoney(-4.995)).toBe(-5);
    expect(roundMoney(-1.005)).toBe(-1.01);
  });

  it('IEEE-754 0.1+0.2 não é 0.3; roundMoney corrige para 0.3', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('addMoney/sumMoney somam parcelas até o total da NF sem resíduo IEEE-754', () => {
    expect([0.1, 0.2, 0.3].reduce((sum, value) => sum + value, 0)).not.toBe(0.6);
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6);
    expect(sumMoney([12542.83, 12542.83])).toBe(25085.66);
    expect(addMoney(25085.66, -sumMoney([12542.83, 12542.83]))).toBe(0);
  });

  it('centsToDecimal persiste 1255000 centavos como 12550.00', () => {
    const value = centsToDecimal(1_255_000);
    expect(formatMoneyDecimal(value)).toBe('12550.00');
    expect(decimalToCents(value)).toBe(1_255_000);
  });

  it('formatMoneyDecimalString formata de forma polimórfica Decimal, number, string, null e undefined', () => {
    expect(formatMoneyDecimalString(new Decimal('123.456'))).toBe('123.46');
    expect(formatMoneyDecimalString(123.456)).toBe('123.46');
    expect(formatMoneyDecimalString('123.4')).toBe('123.40');
    expect(formatMoneyDecimalString('4760')).toBe('4760.00');
    expect(formatMoneyDecimalString(null)).toBe('0.00');
    expect(formatMoneyDecimalString(undefined)).toBe('0.00');
    expect(formatMoneyDecimalString({ toString: () => '99.9' })).toBe('99.90');
  });

  it('formatCurrency é alias retrocompatível idêntico a formatMoneyDecimalString', () => {
    expect(formatCurrency).toBe(formatMoneyDecimalString);
  });
});
