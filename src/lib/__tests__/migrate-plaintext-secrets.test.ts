import { readFileSync } from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  migrateTextSecrets,
  TEXT_SECRETS,
  type TextSecretDb,
} from '../../../scripts/migrate-plaintext-secrets';
import { decrypt, encrypt } from '../crypto';

const KEY = 'test-encryption-key-for-vitest-32chars!';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = KEY;
});

type Row = Record<string, unknown> & { id: string };

/**
 * Cliente falso: um mapa modelo → linhas. Todos os modelos de TEXT_SECRETS
 * existem (vazios por omissão), porque a migração recusa um modelo ausente.
 */
function fakeDb(rowsByModel: Record<string, Row[]>) {
  const rows: Record<string, Row[]> = Object.fromEntries(TEXT_SECRETS.map((s) => [s.model, []]));
  Object.assign(rows, rowsByModel);
  const update = vi.fn(async (model: string, where: { id: string }, data: Record<string, string>) => {
    Object.assign(rows[model].find((r) => r.id === where.id)!, data);
  });
  const db: TextSecretDb = Object.fromEntries(
    Object.entries(rows).map(([model, list]) => [
      model,
      {
        findMany: async () => list.map((r) => ({ ...r })),
        update: async ({ where, data }: { where: { id: string }; data: Record<string, string> }) =>
          update(model, where, data),
      },
    ]),
  );
  return { db, update, rows };
}

/** Ciphertext válido na forma, mas produzido com OUTRA chave. */
function encryptedWithOtherKey(text: string): string {
  process.env.ENCRYPTION_KEY = 'outra-chave-que-nao-e-a-do-ambiente-xxxx';
  try {
    return encrypt(text);
  } finally {
    process.env.ENCRYPTION_KEY = KEY;
  }
}

describe('migrateTextSecrets — REAUD-B-08: a forma decide, não a contagem de ":"', () => {
  it('recifra um segredo em claro com dois-pontos (part:part:part) — nunca o pula', async () => {
    const { db, update, rows } = fakeDb({
      certificateConfig: [{ id: 'c1', pfxPassword: 'senha:com:dois-pontos' }],
    });

    const [result] = await migrateTextSecrets(db, true);

    expect(result).toMatchObject({ model: 'certificateConfig', scanned: 1, encrypted: 1, alreadyEncrypted: 0, failed: [] });
    expect(update).toHaveBeenCalledTimes(1);
    expect(rows.certificateConfig[0].pfxPassword).not.toBe('senha:com:dois-pontos');
    expect(decrypt(rows.certificateConfig[0].pfxPassword as string)).toBe('senha:com:dois-pontos');
  });

  it('idem com quatro partes em claro (user:senha:123:x)', async () => {
    const { db, rows } = fakeDb({
      nsdocsConfig: [{ id: 'n1', apiToken: 'user:senha:123:x' }],
    });

    const results = await migrateTextSecrets(db, true);

    expect(results.find((r) => r.model === 'nsdocsConfig')).toMatchObject({ encrypted: 1, alreadyEncrypted: 0, failed: [] });
    expect(decrypt(rows.nsdocsConfig[0].apiToken as string)).toBe('user:senha:123:x');
  });

  it('não reescreve o que já está cifrado — idempotente', async () => {
    const original = encrypt('token-cifrado');
    const { db, update, rows } = fakeDb({
      nsdocsConfig: [{ id: 'n1', apiToken: original }],
    });

    const first = await migrateTextSecrets(db, true);
    const second = await migrateTextSecrets(db, true);

    for (const results of [first, second]) {
      expect(results.find((r) => r.model === 'nsdocsConfig')).toMatchObject({ scanned: 1, encrypted: 0, alreadyEncrypted: 1, failed: [] });
    }
    expect(update).not.toHaveBeenCalled();
    expect(rows.nsdocsConfig[0].apiToken).toBe(original);
  });

  it('valor na forma cifrada que decrypt() não abre vai para failed, linha intacta', async () => {
    const alien = encryptedWithOtherKey('segredo');
    const { db, update, rows } = fakeDb({
      receitaNfseConfig: [{ id: 'r1', apiToken: alien }],
    });

    const results = await migrateTextSecrets(db, true);

    const r = results.find((x) => x.model === 'receitaNfseConfig')!;
    expect(r).toMatchObject({ encrypted: 0, alreadyEncrypted: 0 });
    expect(r.failed).toEqual([{ id: 'r1', field: 'apiToken', reason: expect.any(String) }]);
    expect(update).not.toHaveBeenCalled();
    expect(rows.receitaNfseConfig[0].apiToken).toBe(alien);
  });

  it('sem --apply conta o que faria e não grava', async () => {
    const { db, update, rows } = fakeDb({
      certificateConfig: [{ id: 'c1', pfxPassword: 'em-claro' }],
    });

    const [result] = await migrateTextSecrets(db, false);

    expect(result).toMatchObject({ encrypted: 1, alreadyEncrypted: 0, failed: [] });
    expect(update).not.toHaveBeenCalled();
    expect(rows.certificateConfig[0].pfxPassword).toBe('em-claro');
  });

  it('ignora campo nulo ou vazio; migra só o campo em claro numa linha com dois', async () => {
    const cifrado = encrypt('access');
    const { db, rows } = fakeDb({
      oneDriveConnection: [
        { id: 'o1', accessToken: cifrado, refreshToken: 'refresh-em-claro' },
        { id: 'o2', accessToken: '', refreshToken: null },
      ],
    });

    const results = await migrateTextSecrets(db, true);

    expect(results.find((r) => r.model === 'oneDriveConnection')).toMatchObject({ scanned: 2, encrypted: 1, alreadyEncrypted: 1, failed: [] });
    expect(rows.oneDriveConnection[0].accessToken).toBe(cifrado);
    expect(decrypt(rows.oneDriveConnection[0].refreshToken as string)).toBe('refresh-em-claro');
    expect(rows.oneDriveConnection[1]).toEqual({ id: 'o2', accessToken: '', refreshToken: null });
  });

  it('modelo ausente no cliente lança em vez de pular em silêncio', async () => {
    const { db } = fakeDb({});
    delete db.n8nIntegrationConfig;

    await expect(migrateTextSecrets(db, false)).rejects.toThrow('n8nIntegrationConfig');
  });
});

describe('TEXT_SECRETS — REAUD-B-07: cobre tudo o que decrypt() lê', () => {
  it('inclui N8nIntegrationConfig.apiToken', () => {
    expect(TEXT_SECRETS).toContainEqual({ model: 'n8nIntegrationConfig', fields: ['apiToken'] });
  });

  it('recifra um token n8n em claro', async () => {
    const { db, rows } = fakeDb({
      n8nIntegrationConfig: [{ id: 'w1', apiToken: 'n8n_api_token_em_claro' }],
    });

    const results = await migrateTextSecrets(db, true);

    expect(results.find((r) => r.model === 'n8nIntegrationConfig')).toMatchObject({ encrypted: 1, failed: [] });
    expect(decrypt(rows.n8nIntegrationConfig[0].apiToken as string)).toBe('n8n_api_token_em_claro');
  });

  it('cada entrada existe no schema.prisma como modelo com campo String', () => {
    const schema = readFileSync(path.resolve(__dirname, '../../../prisma/schema.prisma'), 'utf8');
    for (const { model, fields } of TEXT_SECRETS) {
      const modelName = model[0].toUpperCase() + model.slice(1);
      const body = schema.match(new RegExp(`^model ${modelName} \\{([\\s\\S]*?)^\\}`, 'm'))?.[1];
      expect(body, `model ${modelName} no schema`).toBeDefined();
      for (const field of fields) {
        expect(body, `${modelName}.${field} String`).toMatch(new RegExp(`^\\s+${field}\\s+String\\??\\s`, 'm'));
      }
    }
  });
});
