/**
 * extract-pdf-text.ts (CASSEMS) — Adaptador para o motor unificado pdf/extract-text.
 */
import { extractPdfText as baseExtract } from '@/lib/pdf/extract-text';

export async function extractPdfText(pdf: Buffer): Promise<string> {
  return baseExtract(pdf, { prefix: 'cassems-ocr' });
}
