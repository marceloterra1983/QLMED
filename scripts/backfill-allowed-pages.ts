/**
 * QLMED-AUTH-005 — backfill de `User.allowedPages`.
 *
 * Antes desta correção, `allowedPages = []` significava ACESSO TOTAL: o guarda
 * (`canAccessPage`/`canAccessApi`) devolvia `true` para lista vazia, e a tela de
 * Usuários gravava `[]` quando o admin marcava "Todas as páginas". Depois da
 * correção, `[]` significa NENHUMA página.
 *
 * Sem este backfill, todo utilizador que hoje tem `[]` no banco — inclusive os
 * operadores a quem alguém concedeu "todas as páginas" — perde o painel inteiro
 * no primeiro deploy. Este script converte esse `[]` implícito na lista
 * explícita que ele já significava.
 *
 * O default do schema é `[]` e continua a ser: para um utilizador NOVO, "nada
 * concedido ainda" é a resposta certa. O backfill é uma correção pontual do
 * acervo, não uma mudança de default — por isso é um script e não uma migração
 * (e o schema não foi tocado).
 *
 * Três cercas (REAUD-B-11), porque o `[]` legado ("tudo") e o `[]` novo ("nada
 * ainda") são indistinguíveis no banco:
 *  - só `status: 'active'` — um inativo/pendente/rejeitado nunca teve "tudo";
 *  - só `createdAt < --created-before` — o acervo anterior ao deploy, nunca um
 *    utilizador criado já sob a semântica nova. Obrigatório fora do dry-run;
 *  - `/sistema/*` fica de fora por omissão. Conceder Usuários e Configurações
 *    a todo operador do acervo é escalada, não preservação; quem quiser isso
 *    pede com `--include-admin-pages`.
 *
 * Uso:
 *   npx tsx scripts/backfill-allowed-pages.ts --dry-run                              # só relata
 *   npx tsx scripts/backfill-allowed-pages.ts --created-before=2026-09-01T00:00:00Z  # aplica
 *   npx tsx scripts/backfill-allowed-pages.ts --created-before=... --include-admin-pages
 *
 * Admins não são tocados: o papel já os isenta do ACL, dar-lhes a lista
 * explícita não muda nada e só criaria ruído no audit.
 */

import { pathToFileURL } from 'url';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getCanonicalDatabaseUrl } from '../src/lib/database-config';
import { ALL_PAGES } from '../src/lib/navigation';

/** Páginas administrativas: nunca entram na concessão sem pedido explícito. */
export const ADMIN_PAGE_PREFIX = '/sistema/';

export function pagesToGrant(includeAdminPages: boolean): string[] {
  return ALL_PAGES.map((page) => page.path).filter(
    (path) => includeAdminPages || !path.startsWith(ADMIN_PAGE_PREFIX),
  );
}

export interface BackfillOptions {
  /** Só utilizadores criados ANTES deste instante. Obrigatório fora do dry-run. */
  createdBefore: Date | null;
  includeAdminPages: boolean;
  dryRun: boolean;
}

export interface BackfillUser {
  id: string;
  email: string;
  role: string;
  status: string;
}

type BackfillWhere = {
  allowedPages: { isEmpty: true };
  role: { not: 'admin' };
  status: 'active';
  createdAt?: { lt: Date };
};

/** Cliente mínimo que o backfill usa — o PrismaClient real satisfaz este tipo. */
export interface BackfillDb {
  user: {
    findMany: (args: {
      where: BackfillWhere;
      select: { id: true; email: true; role: true; status: true };
      orderBy: { createdAt: 'asc' };
    }) => Promise<BackfillUser[]>;
    updateMany: (args: {
      where: BackfillWhere & { id: { in: string[] } };
      data: { allowedPages: string[] };
    }) => Promise<{ count: number }>;
  };
}

export function parseArgs(argv: readonly string[]): BackfillOptions {
  const prefix = '--created-before=';
  const raw = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  let createdBefore: Date | null = null;
  if (raw !== undefined) {
    createdBefore = new Date(raw);
    if (Number.isNaN(createdBefore.getTime())) {
      throw new Error(
        `--created-before inválido: "${raw}" (esperado ISO 8601, ex.: 2026-09-01T00:00:00Z)`,
      );
    }
  }
  return {
    createdBefore,
    includeAdminPages: argv.includes('--include-admin-pages'),
    dryRun: argv.includes('--dry-run'),
  };
}

export async function backfillAllowedPages(db: BackfillDb, opts: BackfillOptions) {
  if (!opts.dryRun && !opts.createdBefore) {
    throw new Error(
      '--created-before=<ISO> é obrigatório sem --dry-run: o backfill só pode tocar '
        + 'o acervo anterior ao deploy da semântica nova de allowedPages.',
    );
  }

  const where: BackfillWhere = {
    allowedPages: { isEmpty: true },
    role: { not: 'admin' },
    status: 'active',
    ...(opts.createdBefore ? { createdAt: { lt: opts.createdBefore } } : {}),
  };
  const pages = pagesToGrant(opts.includeAdminPages);

  const candidates = await db.user.findMany({
    where,
    select: { id: true, email: true, role: true, status: true },
    orderBy: { createdAt: 'asc' },
  });

  let updated = 0;
  if (!opts.dryRun && candidates.length > 0) {
    // O mesmo `where` na escrita: quem mudou de estado entre a leitura e a
    // gravação não é tocado.
    const result = await db.user.updateMany({
      where: { ...where, id: { in: candidates.map((u) => u.id) } },
      data: { allowedPages: pages },
    });
    updated = result.count;
  }

  return { candidates, pages, updated };
}

async function main(prisma: PrismaClient, opts: BackfillOptions) {
  const { candidates, pages, updated } = await backfillAllowedPages(prisma, opts);

  console.log(
    `${candidates.length} utilizador(es) ativo(s) não-admin com allowedPages vazia`
      + (opts.createdBefore ? ` criado(s) antes de ${opts.createdBefore.toISOString()}` : '')
      + ' (iriam perder o painel inteiro).',
  );
  for (const user of candidates) {
    console.log(`  - ${user.email} (${user.role}, ${user.status})`);
  }

  if (candidates.length === 0) {
    console.log('Nada a fazer.');
    return;
  }

  console.log(
    `\nPáginas a conceder (${pages.length}, ${opts.includeAdminPages ? 'com' : 'sem'} /sistema/*):`
      + `\n  ${pages.join('\n  ')}`,
  );

  if (opts.dryRun) {
    console.log('\n--dry-run: nada gravado.');
    if (!opts.createdBefore) {
      console.log('Sem --created-before o relatório cobre TODO o acervo; aplicar exige o corte.');
    }
    return;
  }

  console.log(`\n${updated} utilizador(es) atualizado(s) com ${pages.length} páginas.`);
  console.log(
    'Revise em /sistema/usuarios e retire o que não for para conceder: o backfill ' +
      'preserva o acesso que existia, não decide qual DEVIA existir.',
  );
}

// Só corre quando é o ponto de entrada: os testes importam as funções acima
// sem abrir o banco.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let opts: BackfillOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(getCanonicalDatabaseUrl()),
  });

  main(prisma, opts)
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
