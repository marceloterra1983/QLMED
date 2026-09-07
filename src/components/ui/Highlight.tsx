'use client';

import React from 'react';
import { expandAccentVariants, tokenizeInvoiceSearch } from '@/lib/nfe/search-engine';

interface HighlightProps {
  text: string | null | undefined;
  query: string | null | undefined;
  className?: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const regexPatternCache = new Map<string, RegExp | null>();

function setCache(key: string, pattern: RegExp | null): void {
  if (regexPatternCache.size >= 50) {
    regexPatternCache.clear();
  }
  regexPatternCache.set(key, pattern);
}

export function getCompiledPattern(query: string | null | undefined): RegExp | null {
  if (!query) return null;
  const trimmed = query.trim();
  if (!trimmed) return null;
  const cached = regexPatternCache.get(trimmed);
  if (cached !== undefined) return cached;

  const criteria = tokenizeInvoiceSearch(trimmed);
  const words = criteria.tokens.length > 0 ? criteria.tokens : [trimmed];
  const variants = Array.from(
    new Set(
      words
        .flatMap(expandAccentVariants)
        .filter((w) => w.length >= 2),
    ),
  );

  const rawDigits = trimmed.replace(/\D/g, '');
  if (rawDigits.length >= 2) {
    if (!variants.includes(rawDigits)) {
      variants.push(rawDigits);
    }
    const unpadded = rawDigits.replace(/^0+/, '');
    if (unpadded.length >= 2 && !variants.includes(unpadded)) {
      variants.push(unpadded);
    }
  }

  if (variants.length === 0) {
    setCache(trimmed, null);
    return null;
  }

  variants.sort((a, b) => b.length - a.length);

  const pattern = new RegExp(`(${variants.map(escapeRegExp).join('|')})`, 'gi');
  setCache(trimmed, pattern);
  return pattern;
}

/**
 * Renders text with matched search terms highlighted using an accessible,
 * high-contrast <mark> tag. Supports Portuguese accent variants and multi-word queries.
 */
export default function Highlight({ text, query, className }: HighlightProps) {
  if (!text) return null;

  const pattern = getCompiledPattern(query);
  if (!pattern) return <span className={className}>{text}</span>;

  const parts = text.split(pattern);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          return (
            <mark
              key={i}
              className="bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 font-semibold px-0.5 rounded-lg"
            >
              {part}
            </mark>
          );
        }
        return part;
      })}
    </span>
  );
}
