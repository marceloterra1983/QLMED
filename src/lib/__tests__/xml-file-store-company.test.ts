import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * FILE-008: o caminho não separava por empresa e o ficheiro nascia com a
 * permissão padrão. Migrar o volume antigo é operação de infra; o que dá para
 * fechar aqui é o layout novo, as permissões e a escrita atómica — com leitura
 * ainda a cair no caminho legado para não perder o que já está gravado.
 */

const backupDir = path.join(os.tmpdir(), `qlmed-xml-store-${process.pid}`);

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

let store: typeof import('@/lib/xml-file-store');

beforeAll(async () => {
  process.env.LOCAL_XML_BACKUP_DIR = backupDir;
  process.env.LOCAL_PDF_BACKUP_DIR = path.join(backupDir, 'pdf');
  store = await import('@/lib/xml-file-store');
});

afterAll(async () => {
  await fs.rm(backupDir, { recursive: true, force: true });
});

const KEY = '50260607832309000197550020000647201004640326';

describe('saveXmlToFile com companyId (FILE-008)', () => {
  it('o caminho contém o companyId', async () => {
    const saved = await store.saveXmlToFile('company-abc', KEY, 'NFE', '<nfe>a</nfe>', new Date('2026-03-10'));

    expect(saved).toBeTruthy();
    expect(saved).toContain(`${path.sep}company-abc${path.sep}`);
    expect(saved).toBe(path.join(backupDir, 'company-abc', '2026_03', `${KEY}-nfe.xml`));
  });

  it('empresas diferentes não partilham ficheiro para a MESMA chave', async () => {
    const a = await store.saveXmlToFile('empresa-a', KEY, 'NFE', '<nfe>a</nfe>', new Date('2026-04-10'));
    const b = await store.saveXmlToFile('empresa-b', KEY, 'NFE', '<nfe>bbbbbbbbbb</nfe>', new Date('2026-04-10'));

    expect(a).not.toBe(b);
    await expect(fs.readFile(a!, 'utf-8')).resolves.toBe('<nfe>a</nfe>');
    await expect(fs.readFile(b!, 'utf-8')).resolves.toBe('<nfe>bbbbbbbbbb</nfe>');
  });

  it('grava com permissão 0600 e sem deixar .tmp para trás', async () => {
    const saved = await store.saveXmlToFile('company-perm', KEY, 'NFE', '<nfe>p</nfe>', new Date('2026-05-10'));

    const stats = await fs.stat(saved!);
    expect(stats.mode & 0o777).toBe(0o600);

    const siblings = await fs.readdir(path.dirname(saved!));
    expect(siblings.some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('recusa companyId que tentaria sair do diretório', async () => {
    expect(store.buildCompanySegment('../../etc')).toBeNull();
    expect(store.buildCompanySegment('')).toBeNull();
    expect(store.buildCompanySegment('ok-123_ABC')).toBe('ok-123_ABC');

    const saved = await store.saveXmlToFile('../../etc', KEY, 'NFE', '<nfe/>', new Date('2026-06-10'));
    expect(saved).toBeNull();
  });
});

describe('leitura com fallback para o layout legado (FILE-008)', () => {
  it('lê o ficheiro antigo, gravado sem companyId, em vez de o perder', async () => {
    // Simula o que já está no volume: <BACKUP_DIR>/<mês>/<ficheiro>
    const legacyDir = path.join(backupDir, '2026_07');
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(path.join(legacyDir, `${KEY}-nfe.xml`), '<nfe>legado</nfe>');

    const resolved = await store.resolveInvoiceXmlContent({
      companyId: 'company-nova',
      accessKey: KEY,
      type: 'NFE',
      issueDate: new Date('2026-07-10'),
      xmlContent: '<nfe>do-banco</nfe>',
    });

    expect(resolved).toBe('<nfe>legado</nfe>');
  });

  it('prefere o caminho novo quando ambos existem', async () => {
    await store.saveXmlToFile('company-pref', KEY, 'NFE', '<nfe>novo</nfe>', new Date('2026-08-10'));
    const legacyDir = path.join(backupDir, '2026_08');
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(path.join(legacyDir, `${KEY}-nfe.xml`), '<nfe>legado</nfe>');

    const resolved = await store.resolveInvoiceXmlContent({
      companyId: 'company-pref',
      accessKey: KEY,
      type: 'NFE',
      issueDate: new Date('2026-08-10'),
      xmlContent: null,
    });

    expect(resolved).toBe('<nfe>novo</nfe>');
  });

  it('cai no xmlContent do banco quando não há ficheiro nenhum', async () => {
    const resolved = await store.resolveInvoiceXmlContent({
      companyId: 'company-vazia',
      accessKey: 'CHAVE_INEXISTENTE_999',
      type: 'NFE',
      issueDate: new Date('2026-09-10'),
      xmlContent: '<nfe>banco</nfe>',
    });

    expect(resolved).toBe('<nfe>banco</nfe>');
  });
});
