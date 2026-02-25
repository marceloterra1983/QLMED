export type InvoiceDirectionValue = 'received' | 'issued';

function normalizeDocument(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
}

export function getEmitterCnpjFromAccessKey(accessKey: string | null | undefined): string {
  const keyDigits = normalizeDocument(accessKey);
  if (keyDigits.length < 20) return '';
  return keyDigits.slice(6, 20);
}

export function resolveInvoiceDirection(
  companyCnpj: string | null | undefined,
  senderCnpj: string | null | undefined,
  accessKey: string | null | undefined,
): InvoiceDirectionValue {
  const companyCnpjClean = normalizeDocument(companyCnpj);
  const senderCnpjClean = normalizeDocument(senderCnpj);
  const emitterFromKey = getEmitterCnpjFromAccessKey(accessKey);
  const referenceEmitter = senderCnpjClean || emitterFromKey;

  if (!companyCnpjClean || !referenceEmitter) return 'received';
  return referenceEmitter === companyCnpjClean ? 'issued' : 'received';
}
