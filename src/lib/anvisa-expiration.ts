/**
 * ANVISA registry expiration utilities.
 * Parses multiple date formats found in ANVISA data and classifies status.
 */

const EXPIRING_SOON_DAYS = 90;

export type ExpirationStatus = 'expired' | 'expiring_soon' | 'valid' | 'unknown';

/**
 * Parse ANVISA expiration value into a Date.
 * Handles: "DD/MM/YYYY", "YYYY-MM-DD", "DD-MM-YYYY", "VALIDADE INDETERMINADA", etc.
 */
export function parseAnvisaExpiration(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  if (!trimmed || trimmed === 'N/A' || trimmed.includes('INDETERMINADA') || trimmed.includes('VIGENTE')) {
    return null;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const brMatch = trimmed.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!isNaN(d.getTime())) return d;
  }

  // YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  // Try generic parse
  const generic = new Date(trimmed);
  if (!isNaN(generic.getTime())) return generic;

  return null;
}

/**
 * Get expiration status for a given expiration date.
 */
export function getExpirationStatus(
  expirationDate: Date | null,
  now: Date = new Date(),
): ExpirationStatus {
  if (!expirationDate) return 'unknown';

  const diffMs = expirationDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return 'expired';
  if (diffDays <= EXPIRING_SOON_DAYS) return 'expiring_soon';
  return 'valid';
}

/**
 * Get days until expiration (negative = expired X days ago).
 */
export function daysUntilExpiration(
  expirationDate: Date | null,
  now: Date = new Date(),
): number | null {
  if (!expirationDate) return null;
  return Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Combined: parse string and return status + days.
 */
export function analyzeAnvisaExpiration(value: string | null | undefined) {
  const date = parseAnvisaExpiration(value);
  const status = getExpirationStatus(date);
  const days = daysUntilExpiration(date);
  return { date, status, days };
}
