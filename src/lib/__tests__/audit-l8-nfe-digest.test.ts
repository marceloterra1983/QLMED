/**
 * Auditoria b177b07, QLMED-FISCAL-006 — o SignedInfo declara
 * `http://www.w3.org/TR/2001/REC-xml-c14n-20010315`, mas o DigestValue era
 * SHA-1 sobre o substring `<infNFe>...</infNFe>` do XML que nós serializamos.
 * Isso só é correto se a nossa serialização JÁ FOR a forma canônica.
 *
 * Não era: `esc()` escapava aspa dupla como `&quot;`, e a C14N 1.0 §2.3 escapa
 * em nó de texto apenas `&`, `<`, `>` e `#xD` — a aspa fica literal. Um `"` na
 * descrição de um produto (`Cabo 5"`) fazia o nosso hash divergir do que a
 * SEFAZ recalcula sobre a forma canônica, e a nota voltava rejeitada.
 *
 * Sem envio à SEFAZ e sem homologação: o vetor é local e o oráculo é a regra de
 * escape da C14N, aplicada à mão no teste.
 */
import crypto from 'node:crypto';
import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { buildNfeAccessKey } from '@/lib/nfe-emission/access-key';
import { buildUnsignedNfeXml } from '@/lib/nfe-emission/xml-builder';
import { signNfeXml } from '@/lib/nfe-emission/xml-sign';
import type { NfeEmissionDraft } from '@/lib/nfe-emission/types';

/** Descrição com os quatro caracteres que a C14N trata de forma diferente. */
const XPROD_COM_ASPA = 'Cabo 5" & fio <A> reforcado';
/** A forma canônica C14N 1.0 do texto acima: & < > escapam, a aspa não. */
const XPROD_CANONICO = 'Cabo 5" &amp; fio &lt;A&gt; reforcado';

function draftComAspa(): NfeEmissionDraft {
  const issueDate = new Date(2026, 7, 30, 10, 0, 0);
  const ender = {
    xLgr: 'Rua A',
    nro: '10',
    xBairro: 'Centro',
    cMun: '5002704',
    xMun: 'Campo Grande',
    UF: 'MS',
    CEP: '79002000',
  };
  return {
    natureza: 'Venda de mercadoria',
    cfop: '5102',
    series: '1',
    number: '8',
    issueDate,
    finNFe: '1',
    indFinal: '1',
    indPres: '1',
    tpAmb: '2',
    modFrete: '9',
    accessKey: buildNfeAccessKey({
      cUf: '50',
      issueDate,
      cnpj: '12345678000199',
      series: '1',
      number: '8',
      cNf: '11111111',
    }),
    emit: { cnpj: '12345678000199', xNome: 'QLMED', ie: '123456789', crt: '1', ender },
    dest: {
      cnpj: '98765432000188',
      xNome: 'Hospital Teste',
      ie: '112233',
      indIEDest: '1',
      ender: { ...ender, UF: 'MS' },
    },
    items: [
      {
        cProd: 'VALV-1',
        xProd: XPROD_COM_ASPA,
        ncm: '90213980',
        cfop: '5102',
        uCom: 'UN',
        qCom: '2',
        vUnCom: '10.005',
        anvisa: '8012345',
      },
    ],
  };
}

function testKeyAndCert() {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  cert.setSubject([{ name: 'commonName', value: 'TEST:12345678000199' }]);
  cert.setIssuer([{ name: 'commonName', value: 'TEST' }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { key: forge.pki.privateKeyToPem(keys.privateKey), cert: forge.pki.certificateToPem(cert) };
}

function sha1Base64(payload: string): string {
  return crypto.createHash('sha1').update(Buffer.from(payload, 'utf8')).digest('base64');
}

describe('QLMED-FISCAL-006 — o digest cobre a forma canônica C14N 1.0', () => {
  it('o serializador emite nó de texto na forma canônica: a aspa fica literal', () => {
    const xml = buildUnsignedNfeXml(draftComAspa());
    expect(xml).toContain(`<xProd>${XPROD_CANONICO}</xProd>`);
    // `&quot;` é a marca do bug: é XML válido, e não é forma canônica.
    expect(xml).not.toContain('&quot;');
  });

  it('o DigestValue é SHA-1 do infNFe canônico, não de um substring qualquer', () => {
    const unsigned = buildUnsignedNfeXml(draftComAspa());
    const infNfe = unsigned.match(/<infNFe\b[\s\S]*<\/infNFe>/)![0];

    // A infNFe é o ápice do node-set (`URI="#NFe..."`), então a C14N renderiza
    // a declaração de namespace nela, e os atributos já saem em ordem canônica.
    expect(infNfe.startsWith('<infNFe xmlns="http://www.portalfiscal.inf.br/nfe" Id="NFe')).toBe(true);
    expect(infNfe).toContain(`<xProd>${XPROD_CANONICO}</xProd>`);

    const pems = testKeyAndCert();
    const signed = signNfeXml(unsigned, pems.key, pems.cert);
    const digest = signed.match(/<DigestValue>([^<]*)<\/DigestValue>/)![1];

    expect(digest).toBe(sha1Base64(infNfe));
    // E não é o hash da forma NÃO canônica que o bug produzia.
    expect(digest).not.toBe(sha1Base64(infNfe.replace(/"/g, '&quot;')));
  });

  it('recusa assinar infNFe não canônico em vez de emitir nota que a SEFAZ rejeita', () => {
    const pems = testKeyAndCert();
    const unsigned = buildUnsignedNfeXml(draftComAspa());
    // Reintroduz à mão exatamente a regressão que o bug era: `&quot;` no texto.
    const naoCanonico = unsigned.replace(
      `<xProd>${XPROD_CANONICO}</xProd>`,
      '<xProd>Cabo 5&quot; reforcado</xProd>',
    );
    expect(naoCanonico).toContain('&quot;');

    expect(() => signNfeXml(naoCanonico, pems.key, pems.cert)).toThrow(/forma canonica C14N/);
  });

  it('recusa CR literal e comentário dentro da infNFe', () => {
    const pems = testKeyAndCert();
    const unsigned = buildUnsignedNfeXml(draftComAspa());

    const comCr = unsigned.replace('<verProc>QLMED</verProc>', '<verProc>QL\rMED</verProc>');
    expect(() => signNfeXml(comCr, pems.key, pems.cert)).toThrow(/CR literal/);

    const comComentario = unsigned.replace('<verProc>', '<!-- nota --><verProc>');
    expect(() => signNfeXml(comComentario, pems.key, pems.cert)).toThrow(/comentario ou CDATA/);
  });

  it('o SignedInfo assinado carrega o xmlns que a C14N devolve ao embutido', () => {
    // Na C14N 1.0 (não exclusiva) o SignedInfo dentro do documento herda o
    // namespace de <Signature> e o canonicalizador o renderiza de volta no start
    // tag. Assinar com o xmlns explícito e embutir sem ele é o que faz os dois
    // lados baterem — se alguém "consertar" isso, a SignatureValue quebra.
    const pems = testKeyAndCert();
    const signed = signNfeXml(buildUnsignedNfeXml(draftComAspa()), pems.key, pems.cert);
    expect(signed).toContain('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo>');
    expect(signed).toContain(
      '<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
    );
  });
});
