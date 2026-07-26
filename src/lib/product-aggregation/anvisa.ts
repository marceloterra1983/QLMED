import { cleanString, ensureArray } from '@/lib/utils';
import type { NFeDet, NFeMed, NFeProd } from '@/types/nfe-xml';

export function normalizeAnvisaRegistration(value: string | null | undefined): string | null {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length === 11) return digits;
  return null;
}

export function extractAnvisaFromFreeText(text: string | null | undefined): string | null {
  const value = text || '';
  if (!value) return null;

  const explicitPattern = /anvisa[^0-9]{0,24}([0-9][0-9.\-/]{6,24})/gi;
  let explicitMatch: RegExpExecArray | null = explicitPattern.exec(value);
  while (explicitMatch) {
    const normalized = normalizeAnvisaRegistration(explicitMatch[1]);
    if (normalized) return normalized;
    explicitMatch = explicitPattern.exec(value);
  }

  const genericPattern = /\b([0-9][0-9.\-/]{6,24})\b/g;
  let genericMatch: RegExpExecArray | null = genericPattern.exec(value);
  while (genericMatch) {
    const normalized = normalizeAnvisaRegistration(genericMatch[1]);
    if (normalized) return normalized;
    genericMatch = genericPattern.exec(value);
  }

  return null;
}

export function extractAnvisa(det: NFeDet, prod: NFeProd): string | null {
  const candidates: Array<string | null> = [
    cleanString(prod?.cProdANVISA),
    ...ensureArray<NFeMed>(det?.med).map((med) => cleanString(med?.cProdANVISA)),
    ...ensureArray<NFeMed>(prod?.med).map((med) => cleanString(med?.cProdANVISA)),
    extractAnvisaFromFreeText(cleanString(det?.infAdProd)),
    extractAnvisaFromFreeText(cleanString(prod?.xProd)),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAnvisaRegistration(candidate);
    if (normalized) return normalized;
  }

  return null;
}
