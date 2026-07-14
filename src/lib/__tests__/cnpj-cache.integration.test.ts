import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import prisma from '@/lib/prisma';

const integrationDescribe = process.env.RUN_DB_INTEGRATION_TESTS === '1' ? describe : describe.skip;
const testCnpj = `97${Date.now().toString().slice(-12)}`;

integrationDescribe('CnpjCache Prisma delegate integration', () => {
  beforeAll(async () => {
    await prisma.cnpjCache.deleteMany({ where: { cnpj: testCnpj } });
  });

  afterAll(async () => {
    await prisma.cnpjCache.deleteMany({ where: { cnpj: testCnpj } });
    await prisma.$disconnect();
  });

  it('creates, reads and updates cnpj_cache through typed Prisma access', async () => {
    const createdAt = new Date('2026-07-13T00:00:00.000Z');
    await prisma.cnpjCache.upsert({
      where: { cnpj: testCnpj },
      create: { cnpj: testCnpj, data: { status: 'first' }, fetchedAt: createdAt },
      update: { data: { status: 'first' }, fetchedAt: createdAt },
    });

    await expect(prisma.cnpjCache.findUnique({ where: { cnpj: testCnpj } })).resolves.toMatchObject({
      cnpj: testCnpj,
      data: { status: 'first' },
      fetchedAt: createdAt,
    });

    const updatedAt = new Date('2026-07-13T01:00:00.000Z');
    await prisma.cnpjCache.upsert({
      where: { cnpj: testCnpj },
      create: { cnpj: testCnpj, data: { status: 'second' }, fetchedAt: updatedAt },
      update: { data: { status: 'second' }, fetchedAt: updatedAt },
    });

    await expect(prisma.cnpjCache.findUnique({ where: { cnpj: testCnpj } })).resolves.toMatchObject({
      data: { status: 'second' },
      fetchedAt: updatedAt,
    });
  });
});
