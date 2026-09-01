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
 *  2. Colunas de texto que guardam saída de `encrypt()`. Um valor fora da
 *     FORMA exata (`isEncryptedText`: salt/iv/tag de 32 hex, ou o legado sem
 *     salt) foi gravado em claro e é recifrado. Um valor na forma é provado
 *     com `decrypt()`: se não abre, é reportado como falha e deixado intacto —
 *     antes era pulado em silêncio e, com o decrypt fail-closed, ficava
 *     ilegível sem aviso (REAUD-B-08).
 *
 * Idempotente nas duas partes: rodar de novo não reescreve o que já está
 * cifrado. Nada é apagado; uma linha que não dá para migrar é reportada e
 * deixada intacta. Sai com código 1 se houve falhas.
 */

import { pathToFileURL } from 'url';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getCanonicalDatabaseUrl } from '../src/lib/database-config';
import { migratePlaintextPfx } from '../src/lib/certificate-secret';
import { decrypt, encrypt, isEncryptedText } from '../src/lib/crypto';

/**
 * Colunas de texto que guardam saída de `encrypt()` — uma por coluna lida com
 * `decrypt()` em src/ (o teste cruza cada entrada com o schema.prisma).
 */
export const TEXT_SECRETS: ReadonlyArray<{ model: string; fields: readonly string[] }> = [
  { model: 'certificateConfig', fields: ['pfxPassword'] },
  { model: 'nsdocsConfig', fields: ['apiToken'] },
  { model: 'receitaNfseConfig', fields: ['apiToken'] },
  { model: 'oneDriveConnection', fields: ['accessToken', 'refreshToken'] },
  { model: 'n8nIntegrationConfig', fields: ['apiToken'] },
];

export interface TextSecretDelegate {
  findMany: (args: { select: Record<string, true> }) => Promise<Array<Record<string, unknown>>>;
  update: (args: { where: { id: string }; data: Record<string, string> }) => Promise<unknown>;
}

/** O PrismaClient real satisfaz este tipo (por cast: os delegates são propriedades). */
export type TextSecretDb = Record<string, TextSecretDelegate | undefined>;

export interface TextSecretResult {
  model: string;
  scanned: number;
  /** Campos fora da forma cifrada: recifrados (ou a recifrar, sem `apply`). */
  encrypted: number;
  /** Campos na forma cifrada que `decrypt()` abre: intactos. */
  alreadyEncrypted: number;
  /** Campos na forma cifrada que `decrypt()` NÃO abre: intactos e reportados. */
  failed: Array<{ id: string; field: string; reason: string }>;
}

export async function migrateTextSecrets(db: TextSecretDb, apply: boolean): Promise<TextSecretResult[]> {
  const results: TextSecretResult[] = [];

  for (const { model, fields } of TEXT_SECRETS) {
    const delegate = db[model];
    if (!delegate?.findMany) {
      // Nome errado na lista é defeito do script, não condição de dados:
      // pular "em silêncio" deixaria a coluna em claro com relatório limpo.
      throw new Error(`TEXT_SECRETS: modelo "${model}" não existe no PrismaClient`);
    }
    const rows = await delegate.findMany({
      select: Object.fromEntries(['id', ...fields].map((f) => [f, true])),
    });
    const result: TextSecretResult = { model, scanned: rows.length, encrypted: 0, alreadyEncrypted: 0, failed: [] };

    for (const row of rows) {
      const id = String(row.id);
      const data: Record<string, string> = {};
      for (const field of fields) {
        const value = row[field];
        if (typeof value !== 'string' || value.length === 0) continue;
        if (!isEncryptedText(value)) {
          data[field] = encrypt(value);
          result.encrypted++;
          continue;
        }
        try {
          decrypt(value);
          result.alreadyEncrypted++;
        } catch (error) {
          result.failed.push({
            id,
            field,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (Object.keys(data).length > 0 && apply) {
        await delegate.update({ where: { id }, data });
      }
    }
    results.push(result);
  }

  return results;
}

async function main(prisma: PrismaClient, apply: boolean) {
  console.log(apply ? '== APLICANDO ==' : '== SIMULAÇÃO (use --apply para gravar) ==');

  console.log('\npfxData (certificado A1):');
  if (apply) {
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
  const results = await migrateTextSecrets(prisma as unknown as TextSecretDb, apply);
  for (const r of results) {
    console.log(
      `  ${r.model}: ${r.scanned} linha(s): ${r.encrypted} campo(s) em claro`
      + `${apply ? ' recifrado(s)' : ' a recifrar'}, ${r.alreadyEncrypted} já cifrado(s), `
      + `${r.failed.length} falha(s)`,
    );
    for (const f of r.failed) console.error(`  FALHA ${r.model}/${f.id}.${f.field}: ${f.reason}`);
    if (r.failed.length > 0) process.exitCode = 1;
  }
}

// Só corre quando é o ponto de entrada: os testes importam as funções acima
// sem abrir o banco.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prisma = new PrismaClient({ adapter: new PrismaPg(getCanonicalDatabaseUrl()) });
  main(prisma, process.argv.includes('--apply'))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
