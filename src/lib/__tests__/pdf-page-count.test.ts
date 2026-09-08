import { describe, expect, it } from 'vitest';
import { countPdfPages } from '@/lib/pdf/pdf-page-count';

const TWO_PAGE = Buffer.from(
  '%PDF-1.4\n'
  + '1 0 obj\n<< /Type /Pages /Count 2 /Kids [2 0 R 3 0 R] >>\nendobj\n'
  + '2 0 obj\n<< /Type /Page /Parent 1 0 R >>\nendobj\n'
  + '3 0 obj\n<< /Type /Page /Parent 1 0 R >>\nendobj\n',
  'latin1',
);

describe('countPdfPages', () => {
  it('lê o maior /Count de /Type /Pages', () => {
    expect(countPdfPages(TWO_PAGE)).toBe(2);
  });

  it('conta /Type /Page quando não há /Count', () => {
    const raw = Buffer.from(
      '%PDF-1.4\n<< /Type /Page >>\n<< /Type /Page >>\n',
      'latin1',
    );
    expect(countPdfPages(raw)).toBe(2);
  });

  it('não trata /Pages como página e devolve no mínimo 1', () => {
    expect(countPdfPages(Buffer.from('%PDF-1.4', 'latin1'))).toBe(1);
    expect(countPdfPages(Buffer.from('%PDF-1.4\n/Type /Pages\n', 'latin1'))).toBe(1);
  });

  it('nunca lança', () => {
    expect(countPdfPages(undefined as unknown as Buffer)).toBe(1);
  });
});
