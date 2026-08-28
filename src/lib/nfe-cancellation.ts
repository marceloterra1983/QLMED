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
    if (cStat && !ACCEPTED_EVENT_STATS.has(cStat)) return null;
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

export async function applyNfeCancellation(input: {
  xml?: string | null;
  providerStatus?: string | null;
  documentType?: string | null;
  accessKey?: string | null;
}): Promise<boolean> {
  const hit = await detectNfeCancellation(input);
  const accessKey = hit.accessKey;
  if (!hit.cancelled || !hit.cancelledAt || !accessKey) return false;

  const result = await prisma.invoice.updateMany({
    where: { accessKey, cancelledAt: null },
    data: { cancelledAt: hit.cancelledAt },
  });
  return result.count > 0;
}
