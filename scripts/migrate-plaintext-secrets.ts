/**
 * Cifra os segredos que ficaram gravados em texto claro (auditoria FILE-007).
 *
 * Rode UMA VEZ por ambiente, antes de subir a versão que tornou o decrypt
 * fail-closed:
 *
 *   npx tsx scripts/migrate-plaintext-secrets.ts          # relatório, não grava
 *   npx tsx scripts/migrate-plaintext-secrets.ts --apply  # grava
 *
 * Duas partes:
 *  1. `pfxData` (Bytes) — o PKCS#12 ia cru para o banco. Passa a AES-256-GCM
 *     com o CNPJ da empresa como AAD. A lógica está em
 *     src/lib/certificate-secret.ts e é coberta por testes.
 *  2. Colunas de texto que guardam saída de `encrypt()`. Um valor que não está
 *     em `salt:iv:tag:ct` nem `iv:tag:ct` foi gravado em claro e é recifrado.
 *
 * Idempotente nas duas partes: rodar de novo não reescreve o que já está
 * cifrado. Nada é apagado; uma linha que não dá para migrar é reportada e
 * deixada intacta.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getCanonicalDatabaseUrl } from '../src/lib/database-config';
import { migratePlaintextPfx } from '../src/lib/certificate-secret';
import { encrypt } from '../src/lib/crypto';

const prisma = new PrismaClient({ adapter: new PrismaPg(getCanonicalDatabaseUrl()) });
const APPLY = process.argv.includes('--apply');

/** Mesma leitura que `decrypt()` faz: 4 partes = formato novo, 3 = legado. */
function looksEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 4 || parts.length === 3;
}

/** Colunas de texto que guardam saída de `encrypt()`. */
const TEXT_SECRETS: Array<{ model: string; fields: string[] }> = [
  { model: 'certificateConfig', fields: ['pfxPassword'] },
  { model: 'nsdocsConfig', fields: ['apiToken'] },
  { model: 'receitaNfseConfig', fields: ['apiToken'] },
  { model: 'oneDriveConnection', fields: ['accessToken', 'refreshToken'] },
];

type Delegate = {
  findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  update: (args: unknown) => Promise<unknown>;
};

async function migrateTextSecrets() {
  for (const { model, fields } of TEXT_SECRETS) {
    const delegate = (prisma as unknown as Record<string, Delegate>)[model];
    if (!delegate?.findMany) {
      console.log(`  ${model}: modelo ausente no schema, pulado`);
      continue;
    }
    const select = Object.fromEntries([['id', true], ...fields.map((f) => [f, true])]);
    const rows = await delegate.findMany({ select });
    let changed = 0;

    for (const row of rows) {
      const data: Record<string, string> = {};
      for (const field of fields) {
        const value = row[field];
        if (typeof value === 'string' && value.length > 0 && !looksEncrypted(value)) {
          data[field] = encrypt(value);
        }
      }
      if (Object.keys(data).length === 0) continue;
      changed++;
      if (APPLY) await delegate.update({ where: { id: row.id as string }, data });
    }
    console.log(`  ${model}: ${rows.length} linha(s), ${changed} com segredo em claro`);
  }
}

async function main() {
  console.log(APPLY ? '== APLICANDO ==' : '== SIMULAÇÃO (use --apply para gravar) ==');

  console.log('\npfxData (certificado A1):');
  if (APPLY) {
    const result = await migratePlaintextPfx(prisma);
    console.log(
      `  ${result.scanned} linha(s): ${result.encrypted} cifrada(s), `
      + `${result.alreadyEncrypted} já cifrada(s), ${result.failed.length} falha(s)`,
    );
    for (const f of result.failed) console.error(`  FALHA ${f.id}: ${f.reason}`);
    if (result.failed.length > 0) process.exitCode = 1;
  } else {
    // Simulação: mesma leitura, update inerte.
    const result = await migratePlaintextPfx({
      certificateConfig: {
        findMany: prisma.certificateConfig.findMany.bind(prisma.certificateConfig),
        update: async () => undefined,
      },
    });
    console.log(
      `  ${result.scanned} linha(s): ${result.encrypted} a cifrar, `
      + `${result.alreadyEncrypted} já cifrada(s), ${result.failed.length} falha(s)`,
    );
    for (const f of result.failed) console.error(`  FALHA ${f.id}: ${f.reason}`);
  }

  console.log('\nColunas de texto:');
  await migrateTextSecrets();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
