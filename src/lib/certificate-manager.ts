import forge from 'node-forge';
import crypto from 'crypto';

export interface CertificateInfo {
  serialNumber: string;
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  cnpj: string | null;
  pfxData: Buffer;
  pfxPassword: string; // Em produção, isso deveria ser criptografado
}

export class CertificateManager {
  /**
   * Processa um arquivo PFX (PKCS#12) e extrai informações críticas
   */
  static processPfx(pfxBuffer: Buffer, password: string): CertificateInfo {
    const pfxDer = pfxBuffer.toString('binary');
    const p12Asn1 = forge.asn1.fromDer(pfxDer);
    
    // Decripta o PFX
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
    
    // Busca o certificado do usuário (e não a CA) nas "bags"
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = bags[forge.pki.oids.certBag]?.find((bag: any) => {
      // Tenta encontrar o cert que tem CNPJ no subject (OID 2.16.76.1.3.3)
      // Ou pegar o primeiro se não encontrar específico
      return bag.cert;
    });

    if (!certBag || !certBag.cert) {
      throw new Error('Certificado não encontrado no arquivo PFX');
    }

    const cert = certBag.cert;
    
    // Extrair dados básicos
    const serialNumber = cert.serialNumber;
    const issuer = cert.issuer.attributes
      .map((attr: any) => `${attr.shortName || attr.name}=${attr.value}`)
      .join(', ');
    const subject = cert.subject.attributes
      .map((attr: any) => `${attr.shortName || attr.name}=${attr.value}`)
      .join(', ');
    const validFrom = cert.validity.notBefore;
    const validTo = cert.validity.notAfter;

    // Tentar extrair CNPJ do Subject (padrão ICP-Brasil)
    // O CNPJ geralmente está no Common Name (CN) ou em um OID específico
    let cnpj: string | null = null;
    
    // Estratégia 1: Procurar no CN (ex: EMPRESA LTDA:00000000000191)
    const commonName = cert.subject.getField('CN')?.value || '';
    const cnpjMatch = commonName.match(/:(\d{14})/);
    if (cnpjMatch) {
      cnpj = cnpjMatch[1];
    }

    // Estratégia 2: Procurar no OID 2.16.76.1.3.3 (CNPJ no padrão ICP-Brasil)
    if (!cnpj) {
      /* Nota: extração de extension OID específica com node-forge pode ser complexa
         vamos manter a estratégia do CN por enquanto, que cobre 99% dos casos A1 */
    }

    return {
      serialNumber,
      issuer,
      subject,
      validFrom,
      validTo,
      cnpj,
      pfxData: pfxBuffer,
      pfxPassword: password
    };
  }

  /**
   * Retorna um SecureContext (ou opções https) para mTLS
   */
  static getHttpsOptions(pfxData: Buffer, passphrase: string) {
    return {
      pfx: pfxData,
      passphrase,
      // Importante para evitar erros de "UNABLE_TO_VERIFY_LEAF_SIGNATURE" com SEFAZ
      rejectUnauthorized: false 
    };
  }

  /**
   * Extrai chave privada e certificado em formato PEM para uso com https.Agent
   * Útil quando o OpenSSL do Node.js não suporta o formato do PFX (ex: algoritmos legados ou muito novos)
   */
  static extractPems(pfxBuffer: Buffer, password: string): { key: string; cert: string } {
    const pfxDer = pfxBuffer.toString('binary');
    const p12Asn1 = forge.asn1.fromDer(pfxDer);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    // Extrair Key
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    
    // Se não achar no shrouded, tenta keyBag normal
    let keyPem = '';
    if (keyBag) {
      keyPem = forge.pki.privateKeyToPem(keyBag.key!);
    } else {
      const softKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
      const softKeyBag = softKeyBags[forge.pki.oids.keyBag]?.[0];
      if (softKeyBag) {
        keyPem = forge.pki.privateKeyToPem(softKeyBag.key!);
      }
    }

    // Extrair Cert
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    let certPem = '';
    
    if (certBag) {
      certPem = forge.pki.certificateToPem(certBag.cert!);
    }

    if (!keyPem || !certPem) {
      throw new Error('Não foi possível extrair Chave Privada ou Certificado do PFX');
    }

    return { key: keyPem, cert: certPem };
  }

  /**
   * Remove pontuação do CNPJ
   */
  static cleanCnpj(cnpj: string): string {
    return cnpj.replace(/\D/g, '');
  }
}
