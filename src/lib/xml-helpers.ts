/**
 * Shared XML object accessor helpers.
 *
 * val() — flat lookup: tries each key on the same object, returns first non-null as string.
 * num() — numeric value from a single key (comma-aware), returns number.
 * gv()  — nested path navigation: walks obj[key1][key2]... handling `._` wrappers.
 */

import type { XmlNode } from '@/types/xml-common';

/** Try each key on `obj`, return the first non-null value as string */
export function val(obj: XmlNode | null | undefined, ...keys: string[]): string {
  for (const k of keys) {
    if (obj?.[k] != null) return String(obj[k]);
  }
  return '';
}

/** Parse a numeric value from `obj[key]` (comma → dot), returning 0 for missing/invalid */
export function num(obj: XmlNode | null | undefined, key: string): number {
  const value = obj?.[key];
  if (value == null || value === '') return 0;
  return parseFloat(String(value).replace(',', '.')) || 0;
}

/** Navigate a nested object path: obj[key1][key2]... with `._` wrapper support */
export function gv(obj: XmlNode | null | undefined, ...keys: string[]): string {
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur == null) return '';
    cur = (cur as XmlNode)[k];
  }
  if (cur == null) return '';
  if (typeof cur === 'object' && (cur as XmlNode)._ != null) return String((cur as XmlNode)._);
  if (typeof cur === 'object') return '';
  return String(cur);
}
