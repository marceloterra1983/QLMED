/** Normalize supplier code for matching: uppercase, trim, strip trailing dots */
export function normalizeCode(code: string): string {
  return code.toUpperCase().trim().replace(/\.+$/, '');
}

/** Strip all non-alphanumeric characters for fuzzy fallback */
export function stripNonAlnum(code: string): string {
  return code.replace(/[^A-Z0-9]/g, '');
}
