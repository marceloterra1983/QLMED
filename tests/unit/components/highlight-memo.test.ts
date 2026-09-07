import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import Highlight, { getCompiledPattern, regexPatternCache } from '@/components/ui/Highlight';

const render = (text: string | null, query: string | null | undefined, className?: string) =>
  renderToStaticMarkup(React.createElement(Highlight, { text, query, className }));

describe('Highlight Component & getCompiledPattern Memoization', () => {
  beforeEach(() => {
    regexPatternCache.clear();
  });

  describe('Matches plain text and terms with accents', () => {
    it('matches unaccented query against accented text ("sao" -> "São Paulo")', () => {
      const out = render('São Paulo - SP', 'sao');
      expect(out).toContain('<mark');
      expect(out).toContain('>São</mark>');
      expect(out).toContain(' Paulo - SP');
    });

    it('matches accented query against unaccented text ("são" -> "Sao Paulo")', () => {
      const out = render('Sao Paulo - SP', 'são');
      expect(out).toContain('<mark');
      expect(out).toContain('>Sao</mark>');
    });

    it('matches medical domain terms with accents ("clinica" -> "Clínica Médica")', () => {
      const out = render('Clínica Médica Santa Maria', 'clinica');
      expect(out).toContain('>Clínica</mark>');
    });

    it('preserves mark styling with rounded-lg class', () => {
      const out = render('Hospital Regional', 'hospital');
      expect(out).toContain('rounded-lg');
      expect(out).toContain('bg-amber-100');
      expect(out).toContain('text-amber-900');
    });
  });

  describe('Handles numbers and unpadded numbers', () => {
    it('matches padded search against unpadded text ("0045" matches "45")', () => {
      const out = render('Pedido 45 aprovado', '0045');
      expect(out).toContain('<mark');
      expect(out).toContain('>45</mark>');
      expect(out).toContain('Pedido ');
      expect(out).toContain(' aprovado');
    });

    it('matches unpadded search against padded text ("45" matches "000045")', () => {
      const out = render('Nota Fiscal 000045 emitida', '45');
      expect(out).toContain('<mark');
      expect(out).toContain('>45</mark>');
      expect(out).toContain('0000');
    });

    it('matches full invoice numbers with leading zeros', () => {
      const out = render('NF 000065053', '65053');
      expect(out).toContain('<mark');
      expect(out).toContain('>65053</mark>');
    });
  });

  describe('Handles special characters without regex errors', () => {
    it('safely handles regex meta-characters in query without crashing', () => {
      const specialQueries = [
        'test (special)',
        '[brackets]',
        'val*+?^$',
        'item {1,2}',
        'foo|bar',
        '\\escaped\\',
        'R$ 1.500,00',
        '***',
        '???',
      ];

      for (const q of specialQueries) {
        expect(() => {
          getCompiledPattern(q);
          render('Item R$ 1.500,00 (special) [brackets] test', q);
        }).not.toThrow();
      }
    });

    it('matches literal text containing parenthesis and brackets', () => {
      const out = render('Medicamento (Genérico) [Lote 12]', '(Genérico)');
      expect(out).toContain('<mark');
      expect(out).toContain('Genérico');
    });
  });

  describe('Reuses compiled pattern / caches results for identical queries', () => {
    it('returns the exact same RegExp reference for identical queries', () => {
      const pattern1 = getCompiledPattern('hospital');
      const pattern2 = getCompiledPattern('hospital');

      expect(pattern1).not.toBeNull();
      expect(pattern1).toBe(pattern2);
      expect(regexPatternCache.has('hospital')).toBe(true);
    });

    it('reuses cache after trimming whitespace', () => {
      const pattern1 = getCompiledPattern('sao');
      const pattern2 = getCompiledPattern('  sao  ');

      expect(pattern1).toBe(pattern2);
      expect(regexPatternCache.has('sao')).toBe(true);
    });

    it('stores null in cache for query with no valid variants (e.g. single char)', () => {
      const pattern1 = getCompiledPattern('a');
      expect(pattern1).toBeNull();
      expect(regexPatternCache.has('a')).toBe(true);
      expect(regexPatternCache.get('a')).toBeNull();

      const pattern2 = getCompiledPattern('a');
      expect(pattern2).toBeNull();
    });

    it('returns null for empty or whitespace query without polluting cache', () => {
      expect(getCompiledPattern('')).toBeNull();
      expect(getCompiledPattern('   ')).toBeNull();
      expect(getCompiledPattern(null)).toBeNull();
      expect(getCompiledPattern(undefined)).toBeNull();
      expect(regexPatternCache.size).toBe(0);
    });

    it('caps cache size at 50 to prevent memory leaks', () => {
      // Add 60 unique queries
      for (let i = 1; i <= 60; i++) {
        getCompiledPattern(`termo_${i}`);
      }

      // When reaching size > 50, cache is cleared to prevent unbounded memory growth
      expect(regexPatternCache.size).toBeLessThanOrEqual(50);
      expect(regexPatternCache.has('termo_60')).toBe(true);
    });

    it('renders multiple Highlight instances without regex re-compilation', () => {
      const rows = [
        'Hospital São Lucas',
        'São Gabriel Centro',
        'São Paulo Capital',
      ];

      // Initial render - populates cache
      const rendered = rows.map((text) =>
        render(text, 'sao', 'cell-highlight')
      );

      expect(regexPatternCache.size).toBe(1);
      expect(regexPatternCache.has('sao')).toBe(true);

      for (const output of rendered) {
        expect(output).toContain('<mark');
        expect(output).toContain('>São</mark>');
        expect(output).toContain('cell-highlight');
      }
    });
  });
});
