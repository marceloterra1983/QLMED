import { describe, expect, it } from 'vitest';
import { isPathInsideRoot, QUOTE_ARCHIVE_ROOT } from '../orcamentos/archive-store';

describe('arquivo de orçamentos — path', () => {
  it('aceita ficheiro dentro de 0 - ORÇAMENTOS e recusa path traversal', () => {
    expect(isPathInsideRoot(`${QUOTE_ARCHIVE_ROOT}/_email/flavio/x.pdf`)).toBe(true);
    expect(isPathInsideRoot(`${QUOTE_ARCHIVE_ROOT}/../2 - PLANILHAS/x.pdf`)).toBe(false);
  });
});
