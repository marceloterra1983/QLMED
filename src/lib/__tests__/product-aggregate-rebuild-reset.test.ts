import { describe, expect, it } from 'vitest';
import { unmatchedAggregateReset } from '@/lib/product-aggregate-rebuild';

describe('unmatchedAggregateReset', () => {
  it('não apaga data, nota e preço da última compra', () => {
    const data = unmatchedAggregateReset({
      searchText: 'campo',
      computedAt: new Date('2026-09-13T12:00:00Z'),
    });
    expect(data).not.toHaveProperty('aggLastIssueDate');
    expect(data).not.toHaveProperty('aggLastInvoiceNumber');
    expect(data).not.toHaveProperty('aggLastPrice');
    expect(data).not.toHaveProperty('aggLastSaleDate');
    expect(data.aggTotalQuantity).toBe(0);
  });
});
