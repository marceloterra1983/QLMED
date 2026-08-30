import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { CertificateManager } from '@/lib/certificate-manager';
import { assertDestinatarioClientePj, type NfeDestinatario } from './types';

function text(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim();
  if (typeof node === 'object' && node && '_' in node) return String((node as { _: string })._).trim();
  return '';
}

export async function destinatarioFromIssuedXml(xml: string, destCnpj: string): Promise<Partial<NfeDestinatario> | null> {
  const parsed = await parseXmlSafe(xml);
  const inf = parsed?.nfeProc?.NFe?.infNFe || parsed?.NFe?.infNFe;
  const dest = inf?.dest;
  if (!dest) return null;
  const cnpj = CertificateManager.cleanCnpj(text(dest.CNPJ));
  if (cnpj !== destCnpj) return null;
  const ender = dest.enderDest || {};
  const ie = text(dest.IE);
  const ind = text(dest.indIEDest) as NfeDestinatario['indIEDest'];
  return {
    cnpj,
    xNome: text(dest.xNome),
    ie: ie || null,
    indIEDest: ind === '1' || ind === '2' || ind === '9' ? ind : ie ? '1' : '9',
    ender: {
      xLgr: text(ender.xLgr),
      nro: text(ender.nro),
      xCpl: text(ender.xCpl) || undefined,
      xBairro: text(ender.xBairro),
      cMun: text(ender.cMun),
      xMun: text(ender.xMun),
      UF: text(ender.UF),
      CEP: text(ender.CEP).replace(/\D/g, ''),
    },
  };
}

export function mergeDestinatario(
  destCnpj: string,
  clientes: Iterable<string>,
  parts: {
    name?: string | null;
    ie?: string | null;
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    cMun?: string | null;
    email?: string | null;
    fromXml?: Partial<NfeDestinatario> | null;
  },
): NfeDestinatario {
  assertDestinatarioClientePj(destCnpj, clientes);
  const xml = parts.fromXml;
  const xLgr = parts.street || xml?.ender?.xLgr || '';
  const nro = parts.number || xml?.ender?.nro || '';
  const xBairro = parts.district || xml?.ender?.xBairro || '';
  const xMun = parts.city || xml?.ender?.xMun || '';
  const uf = parts.state || xml?.ender?.UF || '';
  const cep = (parts.zip || xml?.ender?.CEP || '').replace(/\D/g, '');
  const cMun = parts.cMun || xml?.ender?.cMun || '';
  if (!xLgr || !nro || !xBairro || !xMun || !uf || !cep || !cMun) {
    throw new Error('Endereço do destinatário incompleto (incluindo município IBGE)');
  }
  const ie = parts.ie || xml?.ie || null;
  return {
    cnpj: destCnpj.replace(/\D/g, ''),
    xNome: parts.name || xml?.xNome || '',
    ie,
    indIEDest: ie && ie.toUpperCase() !== 'ISENTO' ? '1' : '9',
    email: parts.email,
    ender: {
      xLgr,
      nro,
      xCpl: parts.complement || xml?.ender?.xCpl,
      xBairro,
      cMun,
      xMun,
      UF: uf.toUpperCase(),
      CEP: cep,
    },
  };
}
