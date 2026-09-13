import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    invoiceDuplicata: { createMany: mocks.createMany },
    $transaction: vi.fn(),
  },
}));

import { extractAndStoreDuplicatas } from '@/lib/invoice-duplicata-store';

describe('extractAndStoreDuplicatas', () => {
  beforeEach(() => {
    mocks.createMany.mockReset();
  });

  it('não engole falha de gravação', async () => {
    mocks.createMany.mockRejectedValue(new Error('banco indisponível'));
    const xml = `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe></infNFe></NFe></nfeProc>`;
    await expect(extractAndStoreDuplicatas('inv-1', 'comp-1', xml)).rejects.toThrow('banco indisponível');
  });
});
