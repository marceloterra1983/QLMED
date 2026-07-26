import { normalizeForSearch } from '@/lib/utils';

export const INVOICE_PAGE_SIZE = 100;
export const XML_BATCH_SIZE = 50;

export function normalizeToken(value: string | null | undefined) {
  return (value || '').trim().toUpperCase();
}

export function normalizeDescriptionToken(value: string | null | undefined) {
  return normalizeForSearch(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}
