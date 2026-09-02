import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: { company: { upsert: mocks.upsert, findUnique: mocks.findUnique, create: mocks.create } },
}));

import { getOrCreateSingleCompany, getSingleCompany } from '../single-company';

beforeEach(() => {
  mocks.upsert.mockReset();
  mocks.findUnique.mockReset();
  mocks.create.mockReset();
});

describe('getOrCreateSingleCompany', () => {
  it('é um upsert atómico pelo CNPJ — nunca find-depois-create', async () => {
    mocks.upsert.mockResolvedValue({ id: 'c1', cnpj: '07832309000197' });
    const c = await getOrCreateSingleCompany('user-1');
    expect(c.id).toBe('c1');
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const arg = mocks.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ cnpj: '07832309000197' });
    expect(arg.create).toMatchObject({ userId: 'user-1', cnpj: '07832309000197' });
    expect(arg.create.razaoSocial).toBeTruthy();
    // o registo existente não muda de dono
    expect(arg.update).toEqual({});
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('dois pedidos concorrentes num banco vazio resolvem os dois, sem colisão de unique', async () => {
    // O find-depois-create antigo fazia o segundo pedido rebentar em
    // `Company_cnpj_key`. Com upsert, o banco resolve; aqui só se prova que
    // ambos passam pelo mesmo caminho e nenhum chama `create`.
    mocks.upsert.mockResolvedValue({ id: 'c1', cnpj: '07832309000197' });
    const [a, b] = await Promise.all([getOrCreateSingleCompany('u1'), getOrCreateSingleCompany('u2')]);
    expect(a.id).toBe('c1');
    expect(b.id).toBe('c1');
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe('getSingleCompany', () => {
  it('continua a ser uma leitura pelo CNPJ', async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await getSingleCompany()).toBeNull();
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { cnpj: '07832309000197' } });
  });
});
