import { describe, expect, it } from 'vitest';
import { parseXmlSafe, parseXmlSafeNoMerge, getMaxXmlDepth } from '@/lib/safe-xml-parser';

/**
 * FILE-006: o cap era em caracteres e depois do buffer, o DOCTYPE saía por
 * regex e o xml2js não tem limite de profundidade.
 * CUIDADO permanente: XML fiscal real vem em ISO-8859-1 — os testes abaixo
 * travam isso.
 */

function nested(depth: number): string {
  return `${'<a>'.repeat(depth)}x${'</a>'.repeat(depth)}`;
}

describe('profundidade de XML (FILE-006)', () => {
  it('conta a profundidade sem se confundir com self-closing, PI e comentário', () => {
    expect(getMaxXmlDepth('<a><b/></a>')).toBe(1);
    expect(getMaxXmlDepth('<?xml version="1.0"?><a><b><c/></b></a>')).toBe(2);
    expect(getMaxXmlDepth('<a><!-- <b><c> --><b/></a>')).toBe(1);
    expect(getMaxXmlDepth(nested(30))).toBe(30);
  });

  it('recusa aninhamento acima do teto ANTES de o sax descer a árvore', async () => {
    await expect(parseXmlSafe(nested(5_000))).rejects.toThrow(/profundidade/);
    await expect(parseXmlSafeNoMerge(nested(5_000))).rejects.toThrow(/profundidade/);
  });

  it('aceita a profundidade de uma NF-e real (bem abaixo do teto)', async () => {
    const nfe = '<nfeProc><NFe><infNFe><det><prod><xProd>Cateter</xProd></prod></det></infNFe></NFe></nfeProc>';
    expect(getMaxXmlDepth(nfe)).toBe(6);
    await expect(parseXmlSafe(nfe)).resolves.toBeTruthy();
  });
});

describe('DOCTYPE e tamanho (FILE-006)', () => {
  it('DOCTYPE com file:// não vaza conteúdo — recusa antes de parsear', async () => {
    const xxe = `<?xml version="1.0" encoding="ISO-8859-1"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<nfeProc><infNFe>&xxe;</infNFe></nfeProc>`;

    await expect(parseXmlSafe(xxe)).rejects.toThrow(/DOCTYPE/);
    await expect(parseXmlSafeNoMerge(xxe)).rejects.toThrow(/DOCTYPE/);
  });

  it('o cap é em BYTES, não em caracteres', async () => {
    // 6 MiB de caracteres acentuados = ~12 MiB em UTF-8. Pelo antigo
    // `.length` isto passava; em bytes, não passa.
    const accented = `<a>${'ç'.repeat(6 * 1024 * 1024)}</a>`;
    expect(accented.length).toBeLessThan(10 * 1024 * 1024);
    expect(Buffer.byteLength(accented, 'utf8')).toBeGreaterThan(10 * 1024 * 1024);

    await expect(parseXmlSafe(accented)).rejects.toThrow(/limite/);
  });

  it('não quebra XML fiscal declarado como ISO-8859-1 e com acentos', async () => {
    const iso = `<?xml version="1.0" encoding="ISO-8859-1"?>
<nfeProc><infNFe><emit><xNome>CIRÚRGICA SÃO JOSÉ LTDA</xNome></emit></infNFe></nfeProc>`;

    const parsed = await parseXmlSafe(iso) as {
      nfeProc: { infNFe: { emit: { xNome: string } } };
    };
    expect(parsed.nfeProc.infNFe.emit.xNome).toBe('CIRÚRGICA SÃO JOSÉ LTDA');
  });
});
