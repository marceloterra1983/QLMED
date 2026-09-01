import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { prisma } from '@/lib/prisma';
import { issuedCancelTagLabel } from '@/lib/nfe-cancellation-label';

export { issuedCancelTagLabel };

const CANCEL_EVENT = '110111';
const ACCEPTED_EVENT_STATS = new Set(['135', '155']);

export type NfeCancellationHit = {
  cancelled: boolean;
  cancelledAt: Date | null;
  accessKey: string | null;
};

function normalizeText(value?: string | null): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && '_' in value) {
    return asText((value as { _: unknown })._);
  }
  return '';
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pickAccessKey(...candidates: Array<string | null | undefined>): string | null {
  const key = candidates.find((item) => item && /^\d{44}$/.test(item));
  return key || null;
}

function fromProviderStatus(
  documentType: string | null | undefined,
  providerStatus: string | null | undefined,
  fallbackKey: string | null,
): NfeCancellationHit | null {
  const type = normalizeText(documentType);
  if (type && type !== 'NFE') return null;
  const status = normalizeText(providerStatus);
  if (!status) return null;
  if (status.includes('DESACORDO')) return null;
  if (!['CANCEL', 'CANCELADA', 'CANCELAMENTO', 'CANCELADO'].some((term) => status.includes(term))) {
    return null;
  }
  return { cancelled: true, cancelledAt: new Date(), accessKey: fallbackKey };
}

function fromEventNodes(root: Record<string, unknown>, fallbackKey: string | null): NfeCancellationHit | null {
  const proc = asRecord(root.procEventoNFe) || (root.evento && root.retEvento ? root : null);
  if (proc) {
    const evento = asRecord(proc.evento);
    const infEvento = asRecord(evento?.infEvento);
    const retEvento = asRecord(proc.retEvento);
    const infRet = asRecord(retEvento?.infEvento);
    const tpEvento = asText(infRet?.tpEvento || infEvento?.tpEvento);
    if (tpEvento !== CANCEL_EVENT) return null;
    const cStat = asText(infRet?.cStat);
    if (!ACCEPTED_EVENT_STATS.has(cStat)) return null;
    const accessKey = pickAccessKey(asText(infRet?.chNFe), asText(infEvento?.chNFe), fallbackKey);
    const cancelledAt = parseDate(asText(infRet?.dhRegEvento))
      || parseDate(asText(infEvento?.dhEvento))
      || new Date();
    return { cancelled: true, cancelledAt, accessKey };
  }

  const res = asRecord(root.resEvento);
  if (res) {
    if (asText(res.tpEvento) !== CANCEL_EVENT) return null;
    return {
      cancelled: true,
      cancelledAt: parseDate(asText(res.dhEvento)) || new Date(),
      accessKey: pickAccessKey(asText(res.chNFe), fallbackKey),
    };
  }

  return null;
}

export function cancelledAtWrite(hit: NfeCancellationHit): { cancelledAt?: Date } {
  return hit.cancelled && hit.cancelledAt ? { cancelledAt: hit.cancelledAt } : {};
}

export async function detectNfeCancellation(input: {
  xml?: string | null;
  providerStatus?: string | null;
  documentType?: string | null;
  accessKey?: string | null;
}): Promise<NfeCancellationHit> {
  const fallbackKey = pickAccessKey(input.accessKey);
  const empty: NfeCancellationHit = { cancelled: false, cancelledAt: null, accessKey: fallbackKey };

  if (input.xml) {
    try {
      const parsed = asRecord(await parseXmlSafe(input.xml));
      if (parsed) {
        const fromXml = fromEventNodes(parsed, fallbackKey);
        if (fromXml) return fromXml;
      }
    } catch {
      // XML ilegível não inventa cancelamento.
    }
  }

  return fromProviderStatus(input.documentType, input.providerStatus, fallbackKey) || empty;
}

/**
 * Três desfechos, não um booleano (REAUD-FISCAL-015): o cursor NSU só pode
 * travar em `'lost'`. Um `false` que juntava "não era cancelamento" (ciência,
 * carta de correção — a maioria) com "era cancelamento e a nota não está nesta
 * base" fazia o sync descartar o cancelamento e avançar o cursor por cima dele.
 *
 * - `'not-a-cancellation'`: nada a aplicar; nunca trava o cursor.
 * - `'applied'`: a nota foi marcada agora, OU já estava cancelada. A reentrega
 *   de um evento já aplicado é idempotente — contá-la como perdida travaria o
 *   cursor para sempre no mesmo NSU.
 * - `'lost'`: era cancelamento aceite e não existe nota para o receber. A SEFAZ
 *   não reentrega: quem chama tem de reter o cursor.
 */
export type NfeCancellationOutcome = 'not-a-cancellation' | 'applied' | 'lost';

type ApplyNfeCancellationInput = {
  companyId: string;
  xml?: string | null;
  providerStatus?: string | null;
  documentType?: string | null;
  accessKey?: string | null;
};

/**
 * `companyId` é obrigatório de propósito: a chave de acesso vem de XML/provedor
 * externo, então sem o filtro de empresa um evento de cancelamento marcava a
 * nota homónima de qualquer empresa. Sendo obrigatório, o compilador obriga
 * cada chamador a decidir o escopo em vez de esquecê-lo.
 */
export async function applyNfeCancellationOutcome(
  input: ApplyNfeCancellationInput,
): Promise<NfeCancellationOutcome> {
  const hit = await detectNfeCancellation(input);
  const accessKey = hit.accessKey;
  if (!hit.cancelled || !hit.cancelledAt || !accessKey || !input.companyId) return 'not-a-cancellation';

  const result = await prisma.invoice.updateMany({
    where: { companyId: input.companyId, accessKey, cancelledAt: null },
    data: { cancelledAt: hit.cancelledAt },
  });
  if (result.count > 0) return 'applied';

  const exists = await prisma.invoice.count({ where: { companyId: input.companyId, accessKey } });
  return exists > 0 ? 'applied' : 'lost';
}

/**
 * `true` quando a nota está cancelada (marcada agora ou já antes). Colapsa
 * `'not-a-cancellation'` e `'lost'` em `false` — quem precisa distinguir os
 * dois (o cursor de sync) usa `applyNfeCancellationOutcome`.
 */
export async function applyNfeCancellation(input: ApplyNfeCancellationInput): Promise<boolean> {
  return (await applyNfeCancellationOutcome(input)) === 'applied';
}
