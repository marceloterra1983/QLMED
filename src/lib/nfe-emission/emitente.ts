import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { CertificateManager } from '@/lib/certificate-manager';
import type { NfeEmitente } from './types';

function text(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim();
  if (typeof node === 'object' && node && '_' in node) return String((node as { _: string })._).trim();
  return '';
}

export async function emitenteFromIssuedXml(xml: string, companyCnpj: string): Promise<NfeEmitente> {
  const parsed = await parseXmlSafe(xml);
  const inf = parsed?.nfeProc?.NFe?.infNFe || parsed?.NFe?.infNFe;
  const emit = inf?.emit;
  if (!emit) throw new Error('XML emitido sem emitente');
  const ender = emit.enderEmit || {};
  const cnpj = CertificateManager.cleanCnpj(text(emit.CNPJ) || companyCnpj);
  const ie = text(emit.IE);
  const crt = text(emit.CRT);
  const cMun = text(ender.cMun);
  const xMun = text(ender.xMun);
  const uf = text(ender.UF);
  const xLgr = text(ender.xLgr);
  const nro = text(ender.nro);
  const xBairro = text(ender.xBairro);
  const cep = text(ender.CEP);
  if (!ie || !crt || !cMun || !xMun || !uf || !xLgr || !nro || !xBairro || !cep) {
    throw new Error('Emitente incompleto na última NF-e emitida (IE, CRT ou endereço)');
  }
  return {
    cnpj,
    xNome: text(emit.xNome),
    xFant: text(emit.xFant) || undefined,
    ie,
    crt,
    ender: {
      xLgr,
      nro,
      xCpl: text(ender.xCpl) || undefined,
      xBairro,
      cMun,
      xMun,
      UF: uf,
      CEP: cep.replace(/\D/g, ''),
    },
  };
}
