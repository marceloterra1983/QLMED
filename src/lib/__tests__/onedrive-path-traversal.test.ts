import path from 'path';
import { describe, expect, it } from 'vitest';
import { safeJoinUnderDir } from '@/lib/local-xml-sync/sync-utils';

const BASE = '/srv/qlmed/xml_backup';

/**
 * Nomes hostis de item do OneDrive (FILE-004). O nome vem do Graph, não do
 * nosso código: renomear um arquivo no OneDrive é suficiente para tentar
 * escrever fora do diretório de destino.
 */
const HOSTILE_NAMES = [
  '../../etc/cron.d/pwn',
  '../../../root/.ssh/authorized_keys',
  '/etc/passwd',
  '..\\..\\windows\\system32\\evil.xml',
  '....//....//evil.xml',
  '..',
  '.',
  '',
  '   ',
];

describe('safeJoinUnderDir (FILE-004 zip-slip)', () => {
  it.each(HOSTILE_NAMES)('contém ou recusa o nome hostil %j', (name) => {
    const joined = safeJoinUnderDir(BASE, '2026_09', name);

    if (joined === null) return; // recusa explícita também fecha o buraco
    expect(joined.startsWith(BASE + path.sep)).toBe(true);
    expect(joined).not.toContain('..');
  });

  it.each(HOSTILE_NAMES)('contém ou recusa a PASTA hostil %j', (folder) => {
    const joined = safeJoinUnderDir(BASE, folder, 'nota.xml');

    if (joined === null) return;
    expect(joined.startsWith(BASE + path.sep)).toBe(true);
  });

  it('o path.join cru — o código de b177b07 — realmente escapava', () => {
    // Prova de que a fixture ataca algo real, e não um alvo imaginário.
    const naive = path.join(BASE, '2026_09', '../../etc/cron.d/pwn');
    expect(naive.startsWith(BASE + path.sep)).toBe(false);
    expect(naive).toBe('/srv/qlmed/etc/cron.d/pwn');
  });

  it('mantém o caminho normal intacto', () => {
    expect(safeJoinUnderDir(BASE, '2026_09', '3512...-nfe.xml'))
      .toBe(path.join(BASE, '2026_09', '3512...-nfe.xml'));
  });

  it('reduz o nome hostil ao seu basename em vez de perder o arquivo', () => {
    expect(safeJoinUnderDir(BASE, '2026_09', '../../evil.xml'))
      .toBe(path.join(BASE, '2026_09', 'evil.xml'));
  });
});
