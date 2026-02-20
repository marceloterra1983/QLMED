export type InvoiceSyncStatus = 'received' | 'confirmed' | 'rejected';

function normalizeText(value?: string | null): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

/**
 * Mapeia o status textual retornado por provedores (ex.: NSDocs)
 * para o status interno do sistema.
 */
export function mapSourceStatusToInvoiceStatus(
  documentType: string,
  providerStatus?: string | null,
): InvoiceSyncStatus {
  const type = normalizeText(documentType);
  const status = normalizeText(providerStatus);

  if (!status) return 'received';

  if (type === 'CTE') {
    const hasDisagreement = status.includes('DESACORDO');
    const hasCancellation = includesAny(status, ['CANCEL', 'CANCELAMENTO', 'CANCELADO']);

    // CT-e: desacordo registrado
    if (hasDisagreement && !hasCancellation) return 'rejected';

    // CT-e: desacordo cancelado (volta ao estado regular)
    if (hasDisagreement && hasCancellation) return 'confirmed';

    // Mantém conservador para qualquer outro estado de CT-e.
    return 'received';
  }

  if (type === 'NFE') {
    if (includesAny(status, ['CONFIRMACAO DA OPERACAO', 'OPERACAO CONFIRMADA', 'CONFIRMADA'])) {
      return 'confirmed';
    }

    if (includesAny(status, ['DESCONHECIMENTO DA OPERACAO', 'OPERACAO NAO REALIZADA', 'NAO REALIZADA'])) {
      return 'rejected';
    }
  }

  return 'received';
}
