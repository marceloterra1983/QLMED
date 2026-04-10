/**
 * Shared XML object accessor helpers.
 *
 * val() — flat lookup: tries each key on the same object, returns first non-null as string.
 * num() — numeric value from a single key (comma-aware), returns number.
 * gv()  — nested path navigation: walks obj[key1][key2]... handling `._` wrappers.
 */

import type { XmlNode } from '@/types/xml-common';

/**
 * Accepted XML node type for val/gv/num helpers.
 * Uses `object` to accept any interface (typed or with index sig) without requiring
 * callers to add `[key: string]: unknown` to every interface.
 */
type XmlInput = object | null | undefined;

/** Try each key on `obj`, return the first non-null value as string */
export function val(obj: XmlInput, ...keys: string[]): string {
  const o = obj as XmlNode | null | undefined;
  for (const k of keys) {
    if (o?.[k] != null) return String(o[k]);
  }
  return '';
}

/** Parse a numeric value from `obj[key]` (comma → dot), returning 0 for missing/invalid */
export function num(obj: XmlInput, key: string): number {
  const o = obj as XmlNode | null | undefined;
  const value = o?.[key];
  if (value == null || value === '') return 0;
  return parseFloat(String(value).replace(',', '.')) || 0;
}

/** Navigate a nested object path: obj[key1][key2]... with `._` wrapper support */
export function gv(obj: XmlInput, ...keys: string[]): string {
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
