/**
 * Decisão do teclado de uma faixa de abas (WAI-ARIA tabs, activação automática),
 * separada do DOM — o resto é fiação no componente.
 *
 * @returns índice da aba a activar e focar, ou `null` quando a tecla não é nossa
 */
export function alvoDaSeta(atual: number, tecla: string, total: number): number | null {
  if (total === 0) return null;
  switch (tecla) {
    case 'ArrowRight': return (atual + 1) % total;
    case 'ArrowLeft': return (atual - 1 + total) % total;
    case 'Home': return 0;
    case 'End': return total - 1;
    default: return null;
  }
}
