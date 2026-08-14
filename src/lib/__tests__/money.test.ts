import { describe, expect, it } from 'vitest';
import { addMoney, roundMoney, sumMoney } from '@/lib/money';

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
});
