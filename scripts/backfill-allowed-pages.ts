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
 * Uso:
 *   npx tsx scripts/backfill-allowed-pages.ts --dry-run   # só relata
 *   npx tsx scripts/backfill-allowed-pages.ts             # aplica
 *
 * Admins não são tocados: o papel já os isenta do ACL, dar-lhes a lista
 * explícita não muda nada e só criaria ruído no audit.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getCanonicalDatabaseUrl } from '../src/lib/database-config';
import { ALL_PAGES } from '../src/lib/navigation';

const prisma = new PrismaClient({
  adapter: new PrismaPg(getCanonicalDatabaseUrl()),
});

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const everyPage = ALL_PAGES.map((page) => page.path);

  const candidates = await prisma.user.findMany({
    where: { allowedPages: { isEmpty: true }, role: { not: 'admin' } },
    select: { id: true, email: true, role: true, status: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(
    `${candidates.length} utilizador(es) não-admin com allowedPages vazia ` +
      `(iriam perder o painel inteiro).`,
  );
  for (const user of candidates) {
    console.log(`  - ${user.email} (${user.role}, ${user.status})`);
  }

  if (candidates.length === 0) {
    console.log('Nada a fazer.');
    return;
  }

  if (DRY_RUN) {
    console.log(`\n--dry-run: nada gravado. Concederia ${everyPage.length} páginas a cada um.`);
    return;
  }

  const result = await prisma.user.updateMany({
    where: { id: { in: candidates.map((u) => u.id) } },
    data: { allowedPages: everyPage },
  });

  console.log(`\n${result.count} utilizador(es) atualizado(s) com ${everyPage.length} páginas.`);
  console.log(
    'Revise em /sistema/usuarios e retire o que não for para conceder: o backfill ' +
      'preserva o acesso que existia, não decide qual DEVIA existir.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
