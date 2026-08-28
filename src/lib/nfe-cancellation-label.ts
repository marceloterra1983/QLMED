export function issuedCancelTagLabel(cancelledAt?: string | Date | null): string | null {
  return cancelledAt ? 'Cancelado' : null;
}
