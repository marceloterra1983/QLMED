/**
 * extract-pdf-text.ts (IMPCG) — Adaptador para o motor unificado pdf/extract-text.
 */
import { extractPdfText as baseExtract } from '@/lib/pdf/extract-text';

export async function extractPdfText(pdf: Buffer): Promise<string> {
  return baseExtract(pdf, { prefix: 'impcg-ocr', firstPageFallbackPsm4: true });
}
