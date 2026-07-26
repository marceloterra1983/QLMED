import { describe, expect, it } from 'vitest';
import { roundMoney, sumMoney } from '@/lib/money';

describe('money', () => {
  it('roundMoney arredonda half-up em 2 casas', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(1.999)).toBe(2);
  });

  it('sumMoney soma e arredonda', () => {
    expect(sumMoney([10.1, 10.2, 10.3])).toBe(30.6);
  });
});
