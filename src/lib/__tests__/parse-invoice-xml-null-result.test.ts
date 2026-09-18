import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/safe-xml-parser', () => ({
  parseXmlSafe: vi.fn(async () => null),
}));

import { parseInvoiceXml } from '@/lib/parse-invoice-xml';

describe('parseInvoiceXml com árvore nula', () => {
  it('devolve null em vez de estourar em result.nfeProc', async () => {
    await expect(parseInvoiceXml('<nfeProc/>')).resolves.toBeNull();
  });
});
