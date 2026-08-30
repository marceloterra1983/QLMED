import { describe, expect, it } from 'vitest';
import { embeddedPdfViewerSrc } from '@/lib/embedded-pdf-src';

describe('embeddedPdfViewerSrc', () => {
  it('aponta para o pdf.js vendorado com o painel fechado', () => {
    const src = embeddedPdfViewerSrc('/api/gestao/cassems/abc/arquivo');
    expect(src.startsWith('/pdfjs/web/viewer.html?file=')).toBe(true);
    expect(src).toContain(encodeURIComponent('/api/gestao/cassems/abc/arquivo'));
    expect(src).toContain('#pagemode=none');
  });

  it('codifica a rota do arquivo para não quebrar o query do viewer', () => {
    const src = embeddedPdfViewerSrc('/api/gestao/impcg/id-1/arquivo');
    expect(src).toContain('file=%2Fapi%2Fgestao%2Fimpcg%2Fid-1%2Farquivo');
    expect(src).not.toContain('file=/api/gestao');
  });
});
