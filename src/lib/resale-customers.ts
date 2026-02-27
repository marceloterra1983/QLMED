/**
 * Shared resale-customer detection.
 * Sales to these customers are direct resales — their quantities must be
 * subtracted from product entry totals, and they are excluded from
 * lastSaleDate / lastSalePrice and ANVISA issued-NFe lookups.
 */

const RESALE_CUSTOMER_PATTERNS = ['NAVIX', 'PRIME'];

export function isResaleCustomer(recipientName: string | null | undefined): boolean {
  if (!recipientName) return false;
  const upper = recipientName.toUpperCase();
  return RESALE_CUSTOMER_PATTERNS.some((p) => upper.includes(p));
}
