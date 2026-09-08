/**
 * BUG-001: cancelamento de NF-e não revertia o estoque. O backfill filtra
 * `cancelledAt: null`, provando a intenção — notas canceladas não contam saldo —
 * mas quem cancela (SEFAZ/NSDocs/XML de evento) só marcava a Invoice.
 *
 * Desenho: movimentos COMPENSATÓRIOS append-only (kind ESTORNO_CANCELAGEM,
 * direção invertida, mesma localização/lote). Append-only preserva a trilha:
 * dá para auditar "a nota X foi cancelada e estornada" sem destruir história.
 *
 * Idempotência/auto-cura: a chave `estorno:${movement.id}` é estável (cuid do
 * movimento original), e o estorno roda tanto na via "marcou agora" quanto na
 * "já estava cancelada" — reprocessar um evento reentregado conserta o que
 * falhou antes. `occurredAt = cancelledAt` mantém o backfill determinístico.
 */
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('stock-ledger-estorno');

/** Kinds fiscais que geram estorno no cancelamento (SALDO_INICIAL/AJUSTE etc. não). */
const ESTORNOABLE_KINDS = ['ENTRADA_NFE', 'SAIDA_NFE', 'REMESSA_CONSIG', 'RETORNO_CONSIG'] as const;

export async function recordCancellationEstorno(companyId: string, invoiceId: string, cancelledAt: Date): Promise<number> {
  const movements = await prisma.stockMovement.findMany({
    where: {
      companyId,
      invoiceId,
      kind: { in: [...ESTORNOABLE_KINDS] },
      idempotencyKey: { not: { startsWith: 'estorno:' } },
    },
    select: {
      id: true,
      productCodigo: true,
      productName: true,
      lot: true,
      lotExpiry: true,
      lotSerial: true,
      quantity: true,
      direction: true,
      locationType: true,
      locationCnpj: true,
      locationName: true,
      transferGroupId: true,
    },
  });
  if (movements.length === 0) return 0;

  const rows = movements.map((m) => ({
    companyId,
    productCodigo: m.productCodigo,
    productName: m.productName,
    lot: m.lot,
    lotExpiry: m.lotExpiry,
    lotSerial: m.lotSerial,
    quantity: Number(m.quantity),
    // Estorno = direção invertida: o que entrou, sai; o que saiu, volta.
    direction: m.direction === 'IN' ? ('OUT' as const) : ('IN' as const),
    locationType: m.locationType as 'CD' | 'CUSTOMER',
    locationCnpj: m.locationCnpj,
    locationName: m.locationName,
    kind: 'ESTORNO_CANCELAGEM' as const,
    invoiceId,
    reason: 'Estorno por cancelamento de NF-e',
    occurredAt: cancelledAt,
    idempotencyKey: `estorno:${m.id}`,
    transferGroupId: m.transferGroupId,
  }));

  try {
    const result = await prisma.stockMovement.createMany({ data: rows, skipDuplicates: true });
    if (result.count > 0) log.info({ companyId, invoiceId, estornos: result.count }, 'estorno por cancelamento');
    return result.count;
  } catch (err) {
    // Mesmo contrato dos outros hooks do ledger: falha loga, não derruba o
    // fluxo do sync — e a próxima reentrega do evento re-tenta (auto-cura).
    log.error({ err, companyId, invoiceId }, 'Falha ao gravar estorno de cancelamento');
    return 0;
  }
}