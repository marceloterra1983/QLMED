import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageClient = readFileSync(
  join(process.cwd(), 'src/app/(painel)/cadastro/produtos/page-client.tsx'),
  'utf8',
);

describe('produtos groups expanded contract', () => {
  it('limpa collapsedGroups após fetch bem-sucedido (evita tela em branco)', () => {
    // Após setMeta do fetch principal deve expandir grupos.
    const fetchIdx = pageClient.indexOf('setMeta(data.meta || null)');
    expect(fetchIdx).toBeGreaterThan(0);
    const afterFetch = pageClient.slice(fetchIdx, fetchIdx + 280);
    expect(afterFetch).toContain('setCollapsedGroups(new Set())');
  });

  it('nao reaplica auto-collapse por sort/filteredLen', () => {
    expect(pageClient).not.toMatch(/setCollapsedGroups\(groups\)/);
    expect(pageClient).not.toContain('filteredLen');
  });

  it('default de status lista todos os produtos do cadastro (Spica)', () => {
    expect(pageClient).toMatch(
      /useState<'active' \| 'outOfLine' \| 'all'>\('all'\)/,
    );
  });
});
