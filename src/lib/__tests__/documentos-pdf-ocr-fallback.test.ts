import { describe, expect, it } from 'vitest';
import {
  OCR_FALLBACK_MIN_CHARS,
  pickRicherPdfText,
} from '@/lib/documentos/pdf-validity';

describe('SPEC-042 — OCR fallback para cartas escaneadas', () => {
  it('mantém texto pdf.js quando já há camada suficiente', () => {
    const pdfJs = 'x'.repeat(OCR_FALLBACK_MIN_CHARS);
    const ocr = 'Guarulhos, 16 de Fevereiro de 2022. Validade: Um ano.';
    expect(pickRicherPdfText(pdfJs, ocr)).toBe(pdfJs);
  });

  it('OCR fallback preenche PDF escaneado (jsChars=0)', () => {
    const ocr =
      'Guarulhos, 16 de Fevereiro de 2022. *Validade: Um ano a partir desta data.';
    expect(pickRicherPdfText('', ocr)).toBe(ocr);
    expect(pickRicherPdfText('   ', ocr)).toBe(ocr);
  });

  it('não troca por OCR mais pobre', () => {
    expect(pickRicherPdfText('abc', '')).toBe('abc');
  });
});
