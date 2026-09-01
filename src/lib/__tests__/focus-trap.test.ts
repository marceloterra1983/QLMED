import { describe, expect, it } from 'vitest';
import { alvoDoTab, focoInicial, SELETOR_FOCAVEL } from '../focus-trap';

/** Três elementos quaisquer: a decisão é sobre índices, não sobre DOM. */
const tres = ['a', 'b', 'c'];

describe('alvoDoTab', () => {
  it('do último para a frente volta ao primeiro', () => {
    expect(alvoDoTab(tres, 2, false)).toBe(0);
  });

  it('do primeiro para trás vai ao último', () => {
    expect(alvoDoTab(tres, 0, true)).toBe(2);
  });

  it('no meio deixa o navegador seguir', () => {
    expect(alvoDoTab(tres, 1, false)).toBeNull();
    expect(alvoDoTab(tres, 1, true)).toBeNull();
  });

  it('do primeiro para a frente também deixa seguir', () => {
    expect(alvoDoTab(tres, 0, false)).toBeNull();
  });

  it('do último para trás também deixa seguir', () => {
    expect(alvoDoTab(tres, 2, true)).toBeNull();
  });

  it('foco fora do diálogo é trazido de volta pela ponta certa', () => {
    expect(alvoDoTab(tres, -1, false)).toBe(0);
    expect(alvoDoTab(tres, -1, true)).toBe(2);
  });

  it('diálogo com um só focável prende nele', () => {
    expect(alvoDoTab(['a'], 0, false)).toBe(0);
    expect(alvoDoTab(['a'], 0, true)).toBe(0);
  });

  it('sem focáveis não há para onde ir', () => {
    expect(alvoDoTab([], 0, false)).toBeNull();
    expect(alvoDoTab([], -1, true)).toBeNull();
  });
});

describe('focoInicial', () => {
  it('abre no primeiro focável', () => {
    expect(focoInicial(tres)).toBe(0);
  });

  it('sem focáveis devolve null, e o diálogo foca a si mesmo', () => {
    expect(focoInicial([])).toBeNull();
  });
});

describe('SELETOR_FOCAVEL', () => {
  it('cobre os controles que recebem Tab e exclui tabindex -1', () => {
    for (const parte of ['button', '[href]', 'input', 'select', 'textarea']) {
      expect(SELETOR_FOCAVEL).toContain(parte);
    }
    expect(SELETOR_FOCAVEL).toContain('[tabindex]:not([tabindex="-1"])');
  });
});
