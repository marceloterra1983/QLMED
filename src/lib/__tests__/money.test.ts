import { describe, expect, it } from 'vitest';
import { roundMoney } from '@/lib/money';

describe('money', () => {
  it('roundMoney arredonda half-up em 2 casas', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(1.999)).toBe(2);
  });
});
