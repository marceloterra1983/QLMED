import { describe, expect, it } from 'vitest';
import {
  matchValidityFromText,
  readValidityFromPdf,
} from '@/lib/documentos/pdf-validity';

/** Relógio civil fixo: os PDFs de 2026 não podem depender do dia do CI. */
const TODAY = '2026-09-04';

function pdfEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** PDF 1.4 mínimo com camada de texto Helvetica (sem ficheiro binário real). */
function pdfWithPages(pages: string[]): Uint8Array {
  const fontId = 3 + pages.length * 2;
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
  const objs: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
  ];
  for (let i = 0; i < pages.length; i++) {
    const pageId = 3 + i * 2;
    const contentId = pageId + 1;
    const stream = pages[i]
      ? `BT /F1 12 Tf 50 700 Td (${pdfEscape(pages[i])}) Tj ET\n`
      : '';
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  }
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = body.length;
  let out = `${body}xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

describe('SPEC-042 P1 — matchValidityFromText', () => {
  it('FGTS faixa: Validade: 31/08/2026 a 29/09/2026 devolve o fim, nao o inicio', () => {
    const result = matchValidityFromText('Validade: 31/08/2026 a 29/09/2026', TODAY);
    expect(result.validUntil).toBe('2026-09-29');
    expect(result.emitidoEm).toBe('2026-08-31');
    expect(result.confidence).toBe('alta');
    expect(result.matchedLabel).toBe('Validade');
    expect(result.textChars).toBeGreaterThan(0);
  });

  it('rotulo estadual: Certidao valida ate 12/10/2026', () => {
    const result = matchValidityFromText('Certidao valida ate 12/10/2026', TODAY);
    expect(result.validUntil).toBe('2026-10-12');
    expect(result.matchedLabel).toBe('Certidao valida ate');
  });

  it('rotulo estadual com acento e espacos: Válida até', () => {
    const result = matchValidityFromText('Válida  até 12/10/2026', TODAY);
    expect(result.validUntil).toBe('2026-10-12');
    expect(result.matchedLabel).toBe('Valida ate');
  });

  it('rotulo municipal: VALIDADE: 01/10/2026', () => {
    const result = matchValidityFromText('VALIDADE: 01/10/2026', TODAY);
    expect(result.validUntil).toBe('2026-10-01');
    expect(result.matchedLabel).toBe('Validade');
  });

  it('rotulo licenca sanitaria: 7. VALIDADE: 20/10/2026', () => {
    const result = matchValidityFromText('7. VALIDADE: 20/10/2026', TODAY);
    expect(result.validUntil).toBe('2026-10-20');
  });

  it('rotulo receita/CNDT: Válida até', () => {
    const result = matchValidityFromText('Certificado. Válida até 03/10/2026.', TODAY);
    expect(result.validUntil).toBe('2026-10-03');
  });

  it('aa normaliza para 20aa com confianca media', () => {
    const result = matchValidityFromText('Validade: 29/09/26', TODAY);
    expect(result.validUntil).toBe('2026-09-29');
    expect(result.confidence).toBe('media');
  });

  it('nao usa a primeira data do documento (emissao / nascimento / protocolo)', () => {
    const result = matchValidityFromText(
      'Emitida em 01/03/2026. Socio nascido em 12/04/1980. Protocolo 11/22/2025. VALIDADE: 01/10/2026',
      TODAY,
    );
    expect(result.validUntil).toBe('2026-10-01');
  });

  it('texto sem rotulo de validade → nenhuma, mesmo havendo datas', () => {
    const result = matchValidityFromText('Emitida em 01/03/2026. Protocolo 12/12/2025.', TODAY);
    expect(result.validUntil).toBeNull();
    expect(result.confidence).toBe('nenhuma');
    expect(result.matchedLabel).toBeNull();
    expect(result.textChars).toBeGreaterThan(0);
  });

  it('implausivel: VALIDADE 01/01/1900 de rodape nao vira validade', () => {
    const result = matchValidityFromText('VALIDADE: 01/01/1900', TODAY);
    expect(result.validUntil).toBeNull();
    expect(result.confidence).toBe('nenhuma');
  });

  it('implausivel: mais de 10 anos no futuro', () => {
    const result = matchValidityFromText('VALIDADE: 05/09/2036', TODAY);
    expect(result.validUntil).toBeNull();
    expect(result.confidence).toBe('nenhuma');
  });

  it('data civil invalida 31/02 nao vira validade', () => {
    const result = matchValidityFromText('VALIDADE: 31/02/2026', TODAY);
    expect(result.validUntil).toBeNull();
    expect(result.confidence).toBe('nenhuma');
  });

  it('faixa com "de X a Y" depois do rotulo devolve Y', () => {
    const result = matchValidityFromText('Validade de 31/08/2026 a 29/09/2026', TODAY);
    expect(result.validUntil).toBe('2026-09-29');
  });
});

describe('SPEC-042 P1 — readValidityFromPdf', () => {
  it('FGTS faixa lida do conteudo do PDF, nao do nome do ficheiro', async () => {
    const pdf = pdfWithPages(['Certificado de Regularidade do FGTS. Validade: 31/08/2026 a 29/09/2026']);
    const result = await readValidityFromPdf(pdf, TODAY);
    expect(result.validUntil).toBe('2026-09-29');
    expect(result.confidence).toBe('alta');
    expect(result.matchedLabel).toBe('Validade');
    expect(result.textChars).toBeGreaterThan(0);
  });

  it('junta texto de todas as paginas', async () => {
    const pdf = pdfWithPages(['Emitida em 01/03/2026', 'VALIDADE: 01/10/2026']);
    const result = await readValidityFromPdf(pdf, TODAY);
    expect(result.validUntil).toBe('2026-10-01');
  });

  it('digitalizacao: 0 caracteres extraidos → null, nao inventa data', async () => {
    const pdf = pdfWithPages(['']);
    const result = await readValidityFromPdf(pdf, TODAY);
    expect(result.validUntil).toBeNull();
    expect(result.confidence).toBe('nenhuma');
    expect(result.matchedLabel).toBeNull();
    expect(result.textChars).toBe(0);
  });

  it('bytes invalidos nao lancam e devolvem resultado nulo', async () => {
    await expect(readValidityFromPdf(Buffer.from('isto nao e um pdf'), TODAY)).resolves.toEqual({
      validUntil: null,
      emitidoEm: null,
      confidence: 'nenhuma',
      matchedLabel: null,
      textChars: 0,
    });
  });
});

describe('rotulos e formatos reais que faltavam (correcao pos-merge)', () => {
  const HOJE = '2026-09-05';

  it('"Validade ate:" — o rotulo real da CNDG de Campo Grande', () => {
    expect(matchValidityFromText('Validade até: 01/12/2026', HOJE).validUntil).toBe('2026-12-01');
    // controlo positivo: a forma sem "ate" ja funcionava e continua a funcionar
    expect(matchValidityFromText('VALIDADE: 01/12/2026', HOJE).validUntil).toBe('2026-12-01');
  });

  it('data por extenso, dia sem zero a esquerda — forma impressa pela CNDG', () => {
    const r = matchValidityFromText('Validade até: 1 de dezembro de 2026', HOJE);
    expect(r.validUntil).toBe('2026-12-01');
    expect(r.confidence).toBe('alta');
    expect(matchValidityFromText('Valida ate 15 de marco de 2027', HOJE).validUntil).toBe('2027-03-15');
    expect(matchValidityFromText('Validade: 3 de nov de 2026', HOJE).validUntil).toBe('2026-11-03');
  });

  it('mes por extenso inexistente nao vira data', () => {
    expect(matchValidityFromText('Validade: 1 de brumario de 2026', HOJE).validUntil).toBeNull();
  });

  it('faixa cujo FIM nao existe devolve null, nunca a data de INICIO', () => {
    // 31 de setembro nao existe: gralha corrente num CRF. Antes desta correcao
    // o `continue` caia na regra simples e devolvia 2026-08-31 com confianca alta.
    const r = matchValidityFromText('Validade: 31/08/2026 a 31/09/2026', HOJE);
    expect(r.validUntil).toBeNull();
    expect(r.confidence).toBe('nenhuma');
  });

  it('faixa cujo FIM e implausivel devolve null, nunca o inicio', () => {
    const r = matchValidityFromText('Validade: 31/08/2026 a 05/09/2099', HOJE);
    expect(r.validUntil).toBeNull();
  });

  it('faixa valida continua a devolver o FIM', () => {
    expect(matchValidityFromText('Validade: 31/08/2026 a 29/09/2026', HOJE).validUntil).toBe('2026-09-29');
  });
});

describe('SPEC-042 L13 — data de emissão', () => {
  const HOJE = '2026-09-05';

  it('faixa: o início é a emissão e o fim é a validade', () => {
    const r = matchValidityFromText('Validade: 31/08/2026 a 29/09/2026', HOJE);
    expect(r.validUntil).toBe('2026-09-29');
    expect(r.emitidoEm).toBe('2026-08-31');
  });

  it('rótulo explícito emitida em / emitido em / data de emissão / emissão', () => {
    expect(matchValidityFromText('Emitida em 01/03/2026. VALIDADE: 01/10/2026', HOJE).emitidoEm).toBe(
      '2026-03-01',
    );
    expect(matchValidityFromText('Emitido em 15/04/2026. Validade até 12/10/2026', HOJE).emitidoEm).toBe(
      '2026-04-15',
    );
    expect(matchValidityFromText('Data de emissão: 1 de dezembro de 2025. Validade: 01/12/2026', HOJE).emitidoEm).toBe(
      '2025-12-01',
    );
    expect(matchValidityFromText('Emissão: 20/01/2026. VALIDADE: 20/07/2026', HOJE).emitidoEm).toBe('2026-01-20');
  });

  it('nada casou → emitidoEm null, sem inventar', () => {
    const r = matchValidityFromText('Protocolo 12/12/2025. Socio nascido em 12/04/1980.', HOJE);
    expect(r.validUntil).toBeNull();
    expect(r.emitidoEm).toBeNull();
  });

  it('emissão posterior à validade é descartada', () => {
    const r = matchValidityFromText('Emitida em 01/12/2026. VALIDADE: 01/10/2026', HOJE);
    expect(r.validUntil).toBe('2026-10-01');
    expect(r.emitidoEm).toBeNull();
  });

  it('emissão implausível não vira data', () => {
    expect(matchValidityFromText('Emitida em 01/01/1900. VALIDADE: 01/10/2026', HOJE).emitidoEm).toBeNull();
  });

  it('não casa emissão dentro de palavra', () => {
    expect(matchValidityFromText('reemissao 01/03/2026 VALIDADE: 01/10/2026', HOJE).emitidoEm).toBeNull();
  });

  it('nao casa dentro de palavra de sentido oposto', () => {
    expect(matchValidityFromText('Certidao invalida ate 12/10/2026', HOJE).validUntil).toBeNull();
    expect(matchValidityFromText('INVALIDADE: 01/10/2026', HOJE).validUntil).toBeNull();
  });

  it('numero maior colado a data nao e truncado', () => {
    expect(matchValidityFromText('VALIDADE: 29/09/20261', HOJE).validUntil).toBeNull();
    expect(matchValidityFromText('VALIDADE: 129/09/2026', HOJE).validUntil).toBeNull();
  });
});
