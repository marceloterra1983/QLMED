import crypto from 'crypto';
import { deriveKey, decrypt } from '@/lib/crypto';
import { CertificateManager } from '@/lib/certificate-manager';

/**
 * Cifra em repouso do PKCS#12 (certificado A1) — auditoria FILE-007.
 *
 * A senha do PFX já era cifrada; o PFX em si ia cru para a coluna `pfxData`,
 * então um dump do Postgres entregava a chave privada da empresa. Aqui o blob
 * é AES-256-GCM e o CNPJ da empresa entra como AAD: um `pfxData` copiado para
 * outra empresa (ou outro banco) falha a autenticação em vez de decifrar.
 *
 * Layout do blob, tudo binário na mesma coluna `Bytes` (sem mudança de schema):
 *
 *   MAGIC(9) | salt(16) | iv(12) | authTag(16) | ciphertext
 *
 * O magic começa com 'Q' (0x51). Um PFX em claro é DER e começa sempre com
 * SEQUENCE (0x30), então distinguir o formato novo do legado é inequívoco.
 */
const MAGIC = Buffer.from('QLMEDPFX1', 'ascii');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN;

export const PLAINTEXT_PFX_ERROR =
  'pfxData está em texto claro no banco. Rode scripts/migrate-plaintext-secrets.ts '
  + 'para cifrar as linhas existentes antes de usar o certificado.';

function toBuffer(value: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

/** CNPJ só com dígitos, para servir de AAD estável. */
export function cnpjAad(cnpj: string | null | undefined): Buffer {
  const digits = (cnpj || '').replace(/\D/g, '');
  if (digits.length !== 14) {
    throw new Error(`CNPJ inválido para vincular ao certificado: "${cnpj ?? ''}"`);
  }
  return Buffer.from(digits, 'ascii');
}

export function isEncryptedPfx(value: Buffer | Uint8Array): boolean {
  const buf = toBuffer(value);
  return buf.length > HEADER_LEN && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

// `Buffer<ArrayBuffer>` e não `Buffer`: o Prisma exige `Uint8Array<ArrayBuffer>`
// na coluna Bytes e `Buffer.concat` é tipado como `Buffer<ArrayBufferLike>`.
export function encryptPfx(pfx: Buffer | Uint8Array, cnpj: string): Buffer<ArrayBuffer> {
  const aad = cnpjAad(cnpj);
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(salt), iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(toBuffer(pfx)), cipher.final()]);
  return Buffer.from(Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]));
}

export function decryptPfx(value: Buffer | Uint8Array, cnpj: string): Buffer {
  const buf = toBuffer(value);
  if (!isEncryptedPfx(buf)) {
    throw new Error(PLAINTEXT_PFX_ERROR);
  }
  const aad = cnpjAad(cnpj);
  let offset = MAGIC.length;
  const salt = buf.subarray(offset, (offset += SALT_LEN));
  const iv = buf.subarray(offset, (offset += IV_LEN));
  const authTag = buf.subarray(offset, (offset += TAG_LEN));
  const ciphertext = buf.subarray(offset);

  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(salt), iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Único ponto do sistema que transforma a linha de CertificateConfig em PEMs.
 * Todos os consumidores (emissão, StatusServiço, DistDFe, Receita NFS-e)
 * passam por aqui, então é impossível usar `pfxData` cru por engano.
 */
export function openCertificatePems(
  cert: { pfxData: Buffer | Uint8Array; pfxPassword: string },
  companyCnpj: string,
): { key: string; cert: string } {
  const pfx = decryptPfx(cert.pfxData, companyCnpj);
  return CertificateManager.extractPems(pfx, decrypt(cert.pfxPassword));
}

/* ── Migração das linhas gravadas antes da cifra ── */

interface MigratablePfxRow {
  id: string;
  pfxData: Buffer | Uint8Array;
  company: { cnpj: string } | null;
}

/** Cliente mínimo que a migração usa — o PrismaClient real satisfaz este tipo. */
export interface PfxMigrationDb {
  certificateConfig: {
    findMany: (args: {
      select: { id: true; pfxData: true; company: { select: { cnpj: true } } };
    }) => Promise<MigratablePfxRow[]>;
    update: (args: {
      where: { id: string };
      data: { pfxData: Buffer<ArrayBuffer> };
    }) => Promise<unknown>;
  };
}

export interface PfxMigrationResult {
  scanned: number;
  encrypted: number;
  alreadyEncrypted: number;
  failed: Array<{ id: string; reason: string }>;
}

/**
 * Cifra in-place os `pfxData` que ainda estão em DER cru.
 *
 * Idempotente: uma linha que já começa pelo magic é contada e pulada, sem
 * update. Uma linha sem empresa (ou com CNPJ inválido) é reportada em `failed`
 * e deixada intacta — melhor uma linha por migrar do que uma linha ilegível.
 */
export async function migratePlaintextPfx(db: PfxMigrationDb): Promise<PfxMigrationResult> {
  const rows = await db.certificateConfig.findMany({
    select: { id: true, pfxData: true, company: { select: { cnpj: true } } },
  });

  const result: PfxMigrationResult = {
    scanned: rows.length,
    encrypted: 0,
    alreadyEncrypted: 0,
    failed: [],
  };

  for (const row of rows) {
    if (isEncryptedPfx(row.pfxData)) {
      result.alreadyEncrypted++;
      continue;
    }
    try {
      const blob = encryptPfx(row.pfxData, row.company?.cnpj ?? '');
      // Prova antes de gravar: se o round-trip não devolver os bytes originais,
      // a linha fica como está em vez de virar um certificado inutilizável.
      if (Buffer.compare(decryptPfx(blob, row.company!.cnpj), toBuffer(row.pfxData)) !== 0) {
        throw new Error('round-trip divergiu dos bytes originais');
      }
      await db.certificateConfig.update({ where: { id: row.id }, data: { pfxData: blob } });
      result.encrypted++;
    } catch (error) {
      result.failed.push({
        id: row.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
