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

/**
 * Renders text with matched search terms highlighted using an accessible,
 * high-contrast <mark> tag. Supports Portuguese accent variants and multi-word queries.
 */
export default function Highlight({ text, query, className }: HighlightProps) {
  if (!text) return null;
  if (!query || !query.trim()) return <span className={className}>{text}</span>;

  const criteria = tokenizeInvoiceSearch(query);
  const words = criteria.tokens.length > 0 ? criteria.tokens : [query.trim()];

  // Expand accent variants for all words (e.g. sao -> [sao, são])
  const variants = Array.from(
    new Set(
      words
        .flatMap(expandAccentVariants)
        .filter((w) => w.length >= 2),
    ),
  );

  // If query had digits (e.g. invoice number or CNPJ), include raw & unpadded digits
  const rawDigits = query.replace(/\D/g, '');
  if (rawDigits.length >= 2 && !variants.includes(rawDigits)) {
    variants.push(rawDigits);
    const unpadded = rawDigits.replace(/^0+/, '');
    if (unpadded.length >= 2 && !variants.includes(unpadded)) {
      variants.push(unpadded);
    }
  }

  if (variants.length === 0) {
    return <span className={className}>{text}</span>;
  }

  // Sort by length descending so longer words match before sub-parts
  variants.sort((a, b) => b.length - a.length);

  const pattern = new RegExp(`(${variants.map(escapeRegExp).join('|')})`, 'gi');
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
