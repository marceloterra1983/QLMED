import crypto from 'crypto';
import forge from 'node-forge';

function extractInfNfe(unsignedNfe: string): string {
  const match = unsignedNfe.match(/<infNFe\b[\s\S]*<\/infNFe>/);
  if (!match) throw new Error('infNFe ausente no XML');
  return match[0];
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
 * O XML de entrada é gerado por nós, compacto — o digest usa o infNFe tal qual.
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
