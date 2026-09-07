import { describe, it, expect } from 'vitest';
import { buildInvoiceSearchConditions, tokenizeInvoiceSearch } from '@/lib/nfe/search-engine';

describe('Invoice List Search Condition Optimization', () => {
  it('does not include xmlContent when searchXmlContent is false', () => {
    const criteria = tokenizeInvoiceSearch('hospital unimed');
    const conditions = buildInvoiceSearchConditions(criteria, { searchXmlContent: false });
    const jsonStr = JSON.stringify(conditions);
    expect(jsonStr).not.toContain('xmlContent');
  });
});
