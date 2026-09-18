import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({
  prisma: {
    invoice: { findMany },
    company: { findUnique: vi.fn() },
  },
}));

import { findFilesMissingInDatabase } from '@/lib/local-xml-sync/file-import';

describe('findFilesMissingInDatabase', () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([{ accessKey: '50260607832309000197550020000647201004640326' }]);
  });

  it('não puxa xmlContent (TOAST de ~500 MB) só para saber se a nota existe', async () => {
    const accessKey = '50260607832309000197550020000647201004640326';
    await findFilesMissingInDatabase([`/app/xml_backup/${accessKey}-nfe.xml`]);

    expect(findMany).toHaveBeenCalled();
    const arg = findMany.mock.calls[0]?.[0] as { select?: Record<string, unknown> };
    expect(arg.select).toEqual({ accessKey: true });
    expect(arg.select).not.toHaveProperty('xmlContent');
  });

  it('trata nota sem XML persistido como pendente via filtro SQL, não via blob', async () => {
    const accessKey = '50260607832309000197550020000647201004640326';
    await findFilesMissingInDatabase([`/app/xml_backup/${accessKey}-nfe.xml`]);

    const arg = findMany.mock.calls[0]?.[0] as { where?: Record<string, unknown> };
    expect(arg.where).toMatchObject({
      accessKey: { in: [accessKey] },
    });
    expect(arg.where).toHaveProperty('xmlContent');
  });
});
