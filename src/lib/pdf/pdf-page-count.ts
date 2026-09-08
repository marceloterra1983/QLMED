/**
 * Conta páginas de um PDF sem parser completo. Usado no segundo passe
 * do DANFE para preencher FOLHA X de Y. Nunca lança.
 */
export function countPdfPages(pdf: Buffer): number {
  try {
    const text = Buffer.from(pdf ?? []).toString('latin1');
    let best = 0;
    const counts = text.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)/g);
    for (const match of counts) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > best) best = n;
    }
    if (best >= 1) return best;
    const pageObjs = text.match(/\/Type\s*\/Page(?!s)\b/g);
    const n = pageObjs?.length ?? 0;
    return n >= 1 ? n : 1;
  } catch {
    return 1;
  }
}
