import { describe, expect, it } from 'vitest';
import { isPathInsideRoot, QUOTE_ARCHIVE_ROOT, quoteArchivePdfCandidates } from '../orcamentos/archive-store';

describe('arquivo de orçamentos — path', () => {
  it('aceita ficheiro dentro de 0 - ORÇAMENTOS e recusa path traversal', () => {
    expect(isPathInsideRoot(`${QUOTE_ARCHIVE_ROOT}/_email/flavio/x.pdf`)).toBe(true);
    expect(isPathInsideRoot(`${QUOTE_ARCHIVE_ROOT}/../2 - PLANILHAS/x.pdf`)).toBe(false);
  });

  it('lê o OneDrive e o espelho em /app/storage/orcamentos', () => {
    const previous = process.env.QUOTE_ARCHIVE_STORAGE_DIR;
    process.env.QUOTE_ARCHIVE_STORAGE_DIR = '/app/storage/orcamentos';
    try {
      expect(quoteArchivePdfCandidates(`${QUOTE_ARCHIVE_ROOT}/_arquivo/a.pdf`)).toEqual([
        `${QUOTE_ARCHIVE_ROOT}/_arquivo/a.pdf`,
        '/app/storage/orcamentos/_arquivo/a.pdf',
      ]);
      expect(quoteArchivePdfCandidates(`${QUOTE_ARCHIVE_ROOT}/../segredo.pdf`)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.QUOTE_ARCHIVE_STORAGE_DIR;
      else process.env.QUOTE_ARCHIVE_STORAGE_DIR = previous;
    }
  });
});
