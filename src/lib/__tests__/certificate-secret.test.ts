import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cnpjAad,
  decryptPfx,
  encryptPfx,
  isEncryptedPfx,
  migratePlaintextPfx,
  openCertificatePems,
  PLAINTEXT_PFX_ERROR,
  type PfxMigrationDb,
} from '../certificate-secret';
import { encrypt } from '../crypto';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-for-vitest-32chars!';
});

const CNPJ_A = '11222333000181';
const CNPJ_B = '99888777000166';

/**
 * Fixture gerada aqui: DER começa com SEQUENCE (0x30), como um PKCS#12 real.
 * Nenhum PFX de verdade é lido nesta suíte.
 */
function fakePfx(marker = 'CHAVE-PRIVADA-FALSA'): Buffer {
  return Buffer.concat([Buffer.from([0x30, 0x82, 0x04, 0x12]), Buffer.from(marker, 'ascii')]);
}

describe('encryptPfx — o PFX não fica legível no blob', () => {
  it('não contém os bytes do PFX em claro', () => {
    const pfx = fakePfx();
    const blob = encryptPfx(pfx, CNPJ_A);

    expect(blob.includes(pfx)).toBe(false);
    expect(blob.includes(Buffer.from('CHAVE-PRIVADA-FALSA'))).toBe(false);
    expect(blob.subarray(0, 9).toString('ascii')).toBe('QLMEDPFX1');
  });

  it('faz round-trip byte a byte', () => {
    const pfx = fakePfx();

    expect(Buffer.compare(decryptPfx(encryptPfx(pfx, CNPJ_A), CNPJ_A), pfx)).toBe(0);
  });

  it('gera blob diferente a cada chamada (salt/iv aleatórios)', () => {
    const pfx = fakePfx();

    expect(encryptPfx(pfx, CNPJ_A).equals(encryptPfx(pfx, CNPJ_A))).toBe(false);
  });
});

describe('decryptPfx — fail-closed', () => {
  it('recusa um PFX gravado em texto claro em vez de devolvê-lo', () => {
    expect(() => decryptPfx(fakePfx(), CNPJ_A)).toThrow(PLAINTEXT_PFX_ERROR);
  });

  it('recusa um blob truncado', () => {
    const blob = encryptPfx(fakePfx(), CNPJ_A);

    expect(() => decryptPfx(blob.subarray(0, 20), CNPJ_A)).toThrow();
  });

  it('recusa um blob adulterado (authTag do GCM)', () => {
    const blob = encryptPfx(fakePfx(), CNPJ_A);
    blob[blob.length - 1] ^= 0xff;

    expect(() => decryptPfx(blob, CNPJ_A)).toThrow();
  });
});

describe('vínculo com o CNPJ da empresa', () => {
  it('não decifra com o CNPJ de outra empresa', () => {
    const blob = encryptPfx(fakePfx(), CNPJ_A);

    expect(() => decryptPfx(blob, CNPJ_B)).toThrow();
  });

  it('aceita o CNPJ formatado (só os dígitos importam)', () => {
    const pfx = fakePfx();
    const blob = encryptPfx(pfx, '11.222.333/0001-81');

    expect(Buffer.compare(decryptPfx(blob, CNPJ_A), pfx)).toBe(0);
  });

  it('recusa um CNPJ que não tem 14 dígitos', () => {
    expect(() => cnpjAad('123')).toThrow('CNPJ inválido');
    expect(() => encryptPfx(fakePfx(), '')).toThrow('CNPJ inválido');
  });
});

describe('isEncryptedPfx', () => {
  it('distingue o formato novo do DER cru', () => {
    expect(isEncryptedPfx(encryptPfx(fakePfx(), CNPJ_A))).toBe(true);
    expect(isEncryptedPfx(fakePfx())).toBe(false);
    expect(isEncryptedPfx(Buffer.alloc(0))).toBe(false);
  });
});

describe('openCertificatePems', () => {
  it('recusa a linha antes de tocar no node-forge quando o PFX está em claro', () => {
    expect(() =>
      openCertificatePems(
        { pfxData: fakePfx(), pfxPassword: encrypt('senha') },
        CNPJ_A,
      ),
    ).toThrow(PLAINTEXT_PFX_ERROR);
  });
});

/* ── Migração das linhas já gravadas em claro ── */

function fakeDb(rows: Array<{ id: string; pfxData: Buffer; cnpj: string | null }>) {
  const update = vi.fn(async ({ where, data }: { where: { id: string }; data: { pfxData: Buffer } }) => {
    const row = rows.find((r) => r.id === where.id);
    if (row) row.pfxData = data.pfxData;
  });
  const db: PfxMigrationDb = {
    certificateConfig: {
      findMany: async () =>
        rows.map((r) => ({
          id: r.id,
          pfxData: r.pfxData,
          company: r.cnpj === null ? null : { cnpj: r.cnpj },
        })),
      update,
    },
  };
  return { db, update, rows };
}

describe('migratePlaintextPfx', () => {
  it('cifra a linha em claro sem perder um byte', async () => {
    const original = fakePfx('PFX-DA-EMPRESA');
    const { db, update, rows } = fakeDb([
      { id: 'c1', pfxData: Buffer.from(original), cnpj: CNPJ_A },
    ]);

    const result = await migratePlaintextPfx(db);

    expect(result).toMatchObject({ scanned: 1, encrypted: 1, alreadyEncrypted: 0, failed: [] });
    expect(update).toHaveBeenCalledTimes(1);
    expect(isEncryptedPfx(rows[0].pfxData)).toBe(true);
    expect(Buffer.compare(decryptPfx(rows[0].pfxData, CNPJ_A), original)).toBe(0);
  });

  it('é idempotente: a segunda passagem não reescreve nada', async () => {
    const { db, update, rows } = fakeDb([
      { id: 'c1', pfxData: fakePfx(), cnpj: CNPJ_A },
    ]);

    await migratePlaintextPfx(db);
    const before = Buffer.from(rows[0].pfxData);
    const second = await migratePlaintextPfx(db);

    expect(second).toMatchObject({ scanned: 1, encrypted: 0, alreadyEncrypted: 1, failed: [] });
    expect(update).toHaveBeenCalledTimes(1);
    expect(rows[0].pfxData.equals(before)).toBe(true);
  });

  it('deixa intacta a linha sem empresa e reporta a falha', async () => {
    const original = fakePfx('SEM-EMPRESA');
    const { db, update, rows } = fakeDb([
      { id: 'c1', pfxData: Buffer.from(original), cnpj: null },
    ]);

    const result = await migratePlaintextPfx(db);

    expect(result.encrypted).toBe(0);
    expect(result.failed).toEqual([{ id: 'c1', reason: expect.stringContaining('CNPJ inválido') }]);
    expect(update).not.toHaveBeenCalled();
    expect(Buffer.compare(rows[0].pfxData, original)).toBe(0);
  });

  it('migra várias empresas, cada uma amarrada ao próprio CNPJ', async () => {
    const a = fakePfx('EMPRESA-A');
    const b = fakePfx('EMPRESA-B');
    const { db, rows } = fakeDb([
      { id: 'c1', pfxData: Buffer.from(a), cnpj: CNPJ_A },
      { id: 'c2', pfxData: Buffer.from(b), cnpj: CNPJ_B },
    ]);

    const result = await migratePlaintextPfx(db);

    expect(result.encrypted).toBe(2);
    expect(Buffer.compare(decryptPfx(rows[0].pfxData, CNPJ_A), a)).toBe(0);
    expect(Buffer.compare(decryptPfx(rows[1].pfxData, CNPJ_B), b)).toBe(0);
    expect(() => decryptPfx(rows[1].pfxData, CNPJ_A)).toThrow();
  });
});
