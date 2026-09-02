import { describe, expect, it } from 'vitest';
import { alvoDaSeta } from '../tabs-keyboard';

describe('alvoDaSeta', () => {
  it('setas avançam e recuam, circulando nas pontas', () => {
    expect(alvoDaSeta(0, 'ArrowRight', 8)).toBe(1);
    expect(alvoDaSeta(7, 'ArrowRight', 8)).toBe(0);
    expect(alvoDaSeta(3, 'ArrowLeft', 8)).toBe(2);
    expect(alvoDaSeta(0, 'ArrowLeft', 8)).toBe(7);
  });
  it('Home e End vão às pontas', () => {
    expect(alvoDaSeta(5, 'Home', 8)).toBe(0);
    expect(alvoDaSeta(5, 'End', 8)).toBe(7);
  });
  it('outras teclas e faixa vazia não interferem', () => {
    expect(alvoDaSeta(2, 'Tab', 8)).toBeNull();
    expect(alvoDaSeta(2, 'Enter', 8)).toBeNull();
    expect(alvoDaSeta(0, 'ArrowRight', 0)).toBeNull();
  });
});
