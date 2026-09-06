import { describe, expect, it } from 'vitest';
import { extractPdfText } from '@/lib/pdf/extract-text';
import { MAX_PDF_BYTES } from '@/lib/pdf/ocr-limits';

describe('pdf/extract-text', () => {
  it('returns empty string for empty buffer', async () => {
    const text = await extractPdfText(Buffer.alloc(0));
    expect(text).toBe('');
  });

  it('rejects buffers exceeding MAX_PDF_BYTES without writing to disk', async () => {
    const huge = Buffer.alloc(MAX_PDF_BYTES + 10);
    huge.write('%PDF-1.4');
    const text = await extractPdfText(huge);
    expect(text).toBe('');
  });

  it('rejects buffers without PDF magic bytes', async () => {
    const notPdf = Buffer.from('<html><body>Not a PDF file</body></html>');
    const text = await extractPdfText(notPdf);
    expect(text).toBe('');
  });
});
