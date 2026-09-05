import {
  formatCodigo,
  normalizeCodigoDigits,
} from '@/lib/product-codigo-format';

export {
  formatCodigo,
  normalizeCodigoDigits,
  padSpicaCodigo,
  PRODUCT_CODIGO_WIDTH,
} from '@/lib/product-codigo-format';

export type CodigoDb = {
  productRegistry: {
    findMany: (args: {
      where: { companyId: string; NOT: { codigo: null } };
      select: { codigo: true };
    }) => Promise<Array<{ codigo: string | null }>>;
  };
};

/**
 * Próximo código interno da empresa: max(dígitos em product_registry.codigo)+1,
 * com padding de 6 (alinha ao Spica).
 */
export async function nextCodigo(db: CodigoDb, companyId: string): Promise<string> {
  const codigos = await db.productRegistry.findMany({
    where: { companyId, NOT: { codigo: null } },
    select: { codigo: true },
  });
  let maxNum = 0;
  for (const row of codigos) {
    const digits = normalizeCodigoDigits(row.codigo);
    if (!digits) continue;
    const n = Number(digits);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }
  return formatCodigo(maxNum + 1);
}
