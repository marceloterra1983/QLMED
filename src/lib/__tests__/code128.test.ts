import { describe, expect, it } from 'vitest';
import { buildCode128Svg, code128ModuleCount, encodeCode128C } from '@/lib/pdf/code128';

const CHAVE = '50260907832309000197550020000652481004640325';

describe('Code 128C', () => {
  it('exige quantidade par de dígitos', () => {
    expect(() => encodeCode128C('1')).toThrow(/par/);
    expect(() => encodeCode128C('')).toThrow(/par/);
  });

  it('chave de 44 dígitos gera 277 módulos (start + 22 pares + checksum + stop 13)', () => {
    const bits = encodeCode128C(CHAVE);
    expect(code128ModuleCount(bits)).toBe(277);
    expect(bits.endsWith('1100011101011')).toBe(true);
  });

  it('SVG inline não usa data: e cobre a chave', () => {
    const svg = buildCode128Svg(CHAVE);
    expect(svg).toContain('<svg');
    expect(svg).toContain('rect');
    expect(svg).not.toContain('data:');
  });
});
