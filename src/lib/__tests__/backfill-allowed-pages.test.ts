import { describe, expect, it, vi } from 'vitest';
import {
  backfillAllowedPages,
  pagesToGrant,
  parseArgs,
  type BackfillDb,
} from '../../../scripts/backfill-allowed-pages';
import { ALL_PAGES } from '../navigation';

/**
 * REAUD-B-11: o `[]` legado ("tudo") e o `[]` novo ("nada ainda") são iguais
 * no banco. O backfill só pode tocar o acervo ativo anterior ao deploy, e não
 * pode converter "preservar acesso" em "conceder Usuários e Configurações a
 * todo operador". Nenhum banco aqui: o cliente falso interpreta o `where`.
 */

const CUT = new Date('2026-09-01T00:00:00Z');
const BEFORE = new Date('2026-01-15T00:00:00Z');
const AFTER = new Date('2026-09-02T00:00:00Z');

type Row = {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  status: 'pending' | 'active' | 'inactive' | 'rejected';
  allowedPages: string[];
  createdAt: Date;
};

type Where = {
  allowedPages?: { isEmpty: true };
  role?: { not: string };
  status?: string;
  createdAt?: { lt: Date };
  id?: { in: string[] };
};

const matches = (w: Where) => (r: Row) =>
  (!w.allowedPages?.isEmpty || r.allowedPages.length === 0)
  && (!w.role?.not || r.role !== w.role.not)
  && (!w.status || r.status === w.status)
  && (!w.createdAt?.lt || r.createdAt < w.createdAt.lt)
  && (!w.id?.in || w.id.in.includes(r.id));

function fakeDb(rows: Row[]) {
  const findMany = vi.fn(async ({ where }: { where: Where }) =>
    rows.filter(matches(where)).map(({ id, email, role, status }) => ({ id, email, role, status })),
  );
  const updateMany = vi.fn(
    async ({ where, data }: { where: Where; data: { allowedPages: string[] } }) => {
      const hit = rows.filter(matches(where));
      for (const r of hit) r.allowedPages = data.allowedPages;
      return { count: hit.length };
    },
  );
  const db = { user: { findMany, updateMany } } as unknown as BackfillDb;
  return { db, findMany, updateMany, rows };
}

function row(id: string, over: Partial<Row> = {}): Row {
  return {
    id,
    email: `${id}@qlmed.test`,
    role: 'viewer',
    status: 'active',
    allowedPages: [],
    createdAt: BEFORE,
    ...over,
  };
}

const APPLY = { createdBefore: CUT, includeAdminPages: false, dryRun: false };

describe('backfillAllowedPages — quem é tocado', () => {
  it('só o utilizador ativo, não-admin, com lista vazia e criado antes do corte', async () => {
    const { db, rows } = fakeDb([
      row('ativo-antigo'),
      row('inativo', { status: 'inactive' }),
      row('pendente', { status: 'pending' }),
      row('rejeitado', { status: 'rejected' }),
      row('ativo-novo', { createdAt: AFTER }),
      row('admin', { role: 'admin' }),
      row('ja-tem-lista', { allowedPages: ['/fiscal/invoices'] }),
    ]);

    const result = await backfillAllowedPages(db, APPLY);

    expect(result.candidates.map((u) => u.id)).toEqual(['ativo-antigo']);
    expect(result.updated).toBe(1);
    expect(rows.find((r) => r.id === 'ativo-antigo')!.allowedPages.length).toBeGreaterThan(0);
    for (const id of ['inativo', 'pendente', 'rejeitado', 'ativo-novo', 'admin']) {
      expect(rows.find((r) => r.id === id)!.allowedPages).toEqual([]);
    }
    expect(rows.find((r) => r.id === 'ja-tem-lista')!.allowedPages).toEqual(['/fiscal/invoices']);
  });

  it('pede ao Prisma o filtro de status ativo e o corte por createdAt — não filtra em memória', async () => {
    const { db, findMany, updateMany } = fakeDb([row('u1')]);

    await backfillAllowedPages(db, APPLY);

    expect(findMany.mock.calls[0][0].where).toEqual({
      allowedPages: { isEmpty: true },
      role: { not: 'admin' },
      status: 'active',
      createdAt: { lt: CUT },
    });
    expect(updateMany.mock.calls[0][0].where).toMatchObject({
      status: 'active',
      createdAt: { lt: CUT },
      id: { in: ['u1'] },
    });
  });

  it('sem --created-before fora do dry-run, recusa antes de consultar o banco', async () => {
    const { db, findMany, updateMany } = fakeDb([row('u1')]);

    await expect(
      backfillAllowedPages(db, { ...APPLY, createdBefore: null }),
    ).rejects.toThrow('--created-before');
    expect(findMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('--dry-run relata sem gravar', async () => {
    const { db, updateMany, rows } = fakeDb([row('u1')]);

    const result = await backfillAllowedPages(db, { ...APPLY, dryRun: true });

    expect(result.candidates.map((u) => u.id)).toEqual(['u1']);
    expect(result.updated).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
    expect(rows[0].allowedPages).toEqual([]);
  });
});

describe('backfillAllowedPages — o que é concedido', () => {
  const adminPages = ALL_PAGES.map((p) => p.path).filter((p) => p.startsWith('/sistema/'));

  it('a lista concedida não contém /sistema/ por omissão', async () => {
    const { db, rows } = fakeDb([row('u1')]);

    const result = await backfillAllowedPages(db, APPLY);

    expect(adminPages.length).toBeGreaterThan(0);
    expect(result.pages.some((p) => p.startsWith('/sistema/'))).toBe(false);
    expect(rows[0].allowedPages.some((p) => p.startsWith('/sistema/'))).toBe(false);
    expect(result.pages).toHaveLength(ALL_PAGES.length - adminPages.length);
  });

  it('--include-admin-pages concede a lista inteira', async () => {
    const { db, rows } = fakeDb([row('u1')]);

    await backfillAllowedPages(db, { ...APPLY, includeAdminPages: true });

    expect(rows[0].allowedPages).toEqual(ALL_PAGES.map((p) => p.path));
  });

  it('pagesToGrant só difere pelas páginas /sistema/*', () => {
    const semAdmin = pagesToGrant(false);
    const comAdmin = pagesToGrant(true);
    expect(comAdmin.filter((p) => !semAdmin.includes(p))).toEqual(adminPages);
  });
});

describe('parseArgs', () => {
  it('lê o corte ISO e as flags', () => {
    expect(parseArgs(['--created-before=2026-09-01T00:00:00Z', '--include-admin-pages'])).toEqual({
      createdBefore: CUT,
      includeAdminPages: true,
      dryRun: false,
    });
    expect(parseArgs(['--dry-run'])).toEqual({ createdBefore: null, includeAdminPages: false, dryRun: true });
  });

  it('recusa um corte que não é data', () => {
    expect(() => parseArgs(['--created-before=lixo'])).toThrow('--created-before inválido');
  });
});
