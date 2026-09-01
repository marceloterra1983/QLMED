/**
 * Decisão do foco preso, separada do DOM.
 *
 * A lógica que erra num diálogo é sempre a mesma: qual elemento recebe o foco
 * quando o Tab passa do último, ou o Shift+Tab passa do primeiro. Isolada aqui,
 * ela é testável sem navegador — o resto do `ui/Modal` é fiação.
 */

/** Seletor do que o navegador considera focável por Tab. */
export const SELETOR_FOCAVEL =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Para onde o Tab deve ir, ou `null` para deixar o navegador seguir.
 *
 * @param focaveis  elementos focáveis do diálogo, em ordem de documento
 * @param atual     índice do elemento com foco, ou -1 se o foco está fora
 * @param shift     Shift+Tab (para trás)
 * @returns índice do alvo, ou `null` quando não há motivo para interferir
 */
export function alvoDoTab(
  focaveis: readonly unknown[],
  atual: number,
  shift: boolean,
): number | null {
  if (focaveis.length === 0) return null;
  // Foco fora do diálogo (clique no fundo, foco perdido): traz de volta.
  if (atual < 0) return shift ? focaveis.length - 1 : 0;
  if (shift) return atual === 0 ? focaveis.length - 1 : null;
  return atual === focaveis.length - 1 ? 0 : null;
}

/** Primeiro elemento que deve receber o foco ao abrir. */
export function focoInicial(focaveis: readonly unknown[]): number | null {
  return focaveis.length > 0 ? 0 : null;
}
