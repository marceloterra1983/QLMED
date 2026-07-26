/**
 * Aritmética monetária na borda (JS number).
 * Preferir Prisma.Decimal nos caminhos de persistência tipados;
 * esta helper unifica arredondamento HALF-UP em 2 casas para UI/stores legados.
 */
export function roundMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((acc, v) => acc + (Number(v) || 0), 0));
}
