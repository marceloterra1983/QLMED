import crypto from 'crypto';
import forge from 'node-forge';

/**
 * Referência de caractere que a C14N 1.0 NÃO emite em nó de texto. A forma
 * canônica só produz `&amp;`, `&lt;`, `&gt;` e `&#xD;`; qualquer outra
 * (`&quot;`, `&apos;`, `&#39;`, entidade nomeada) significa que os bytes que
 * temos em mão não são a forma canônica que a SEFAZ vai recalcular.
 */
const NAO_CANONICO = /&(?!(?:amp|lt|gt|#xD);)/;

function extractInfNfe(unsignedNfe: string): string {
  const match = unsignedNfe.match(/<infNFe\b[\s\S]*<\/infNFe>/);
  if (!match) throw new Error('infNFe ausente no XML');
  const infNfe = match[0];

  // QLMED-FISCAL-006: o digest usa o infNFe tal qual, sem passar por um
  // canonicalizador. Isso só é correto porque xml-builder.ts emite exatamente a
  // forma canônica C14N 1.0 deste subconjunto:
  //
  //   - xmlns declarado no próprio <infNFe> (o ápice do node-set renderiza a
  //     declaração de namespace de qualquer forma);
  //   - atributos já em ordem canônica (Id antes de versao);
  //   - sem comentário, CDATA, instrução de processamento ou DOCTYPE;
  //   - texto escapado pela regra de nó de texto (& < > #xD e nada mais).
  //
  // Esta guarda verifica a última condição em vez de confiar nela. Falha
  // fechada: recusar assinar é melhor que emitir uma NF-e que a SEFAZ rejeita
  // por digest divergente.
  if (NAO_CANONICO.test(infNfe)) {
    throw new Error(
      'infNFe nao esta na forma canonica C14N 1.0: referencia de caractere que a C14N nao emite em no de texto',
    );
  }
  if (infNfe.includes('\r')) {
    throw new Error('infNFe nao esta na forma canonica C14N 1.0: CR literal deveria ser &#xD;');
  }
  if (infNfe.includes('<!--') || infNfe.includes('<![CDATA[')) {
    throw new Error('infNFe nao esta na forma canonica C14N 1.0: comentario ou CDATA');
  }

  return infNfe;
}

function sha1Base64(payload: string): string {
  return crypto.createHash('sha1').update(Buffer.from(payload, 'utf8')).digest('base64');
}

function certCleanBase64(certPem: string): string {
  return certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');
}

/**
 * Assina NF-e (XMLDSig enveloped, C14N 1.0, RSA-SHA1).
 *
 * O digest é SHA-1 sobre o infNFe na forma canônica C14N 1.0. Não há
 * canonicalizador aqui: o XML é gerado por xml-builder.ts já nessa forma, e
 * extractInfNfe recusa a assinatura se os bytes não a satisfizerem.
 *
 * O SignedInfo é assinado COM `xmlns` explícito e embutido SEM ele — de
 * propósito. Na C14N 1.0 (não exclusiva) o SignedInfo dentro do documento herda
 * o namespace de <Signature>, e o canonicalizador o renderiza de volta no start
 * tag, chegando aos mesmos bytes que assinamos.
 */
export function signNfeXml(unsignedNfe: string, keyPem: string, certPem: string): string {
  const infNfe = extractInfNfe(unsignedNfe);
  const digest = sha1Base64(infNfe);
  const idMatch = infNfe.match(/Id="(NFe\d{44})"/);
  if (!idMatch) throw new Error('Id da infNFe inválido');
  const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#${idMatch[1]}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
  const privateKey = forge.pki.privateKeyFromPem(keyPem);
  const md = forge.md.sha1.create();
  md.update(signedInfo, 'utf8');
  const signatureValue = forge.util.encode64(privateKey.sign(md));
  const signature = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfo.replace(' xmlns="http://www.w3.org/2000/09/xmldsig#"', '')}<SignatureValue>${signatureValue}</SignatureValue><KeyInfo><X509Data><X509Certificate>${certCleanBase64(certPem)}</X509Certificate></X509Data></KeyInfo></Signature>`;
  if (!unsignedNfe.includes('</NFe>')) throw new Error('NFe malformada');
  return unsignedNfe.replace('</NFe>', `${signature}</NFe>`);
}
