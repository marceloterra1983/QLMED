import { describe, expect, it, vi } from 'vitest';
import {
  applyListPageParams,
  FINANCEIRO_LIST_PAGE_SIZE,
  FISCAL_LIST_PAGE_SIZE,
  parseIncludeTotal,
  resolveListTotal,
  shouldCountListTotal,
} from '@/lib/list-pagination';

describe('list-pagination', () => {
  it('usa page size entre 50 e 100', () => {
    expect(FISCAL_LIST_PAGE_SIZE).toBeGreaterThanOrEqual(50);
    expect(FISCAL_LIST_PAGE_SIZE).toBeLessThanOrEqual(100);
    expect(FINANCEIRO_LIST_PAGE_SIZE).toBeGreaterThanOrEqual(50);
    expect(FINANCEIRO_LIST_PAGE_SIZE).toBeLessThanOrEqual(100);
  });

  it('omite COUNT quando o cliente já tem o total', () => {
    expect(shouldCountListTotal({
      page: 2,
      limit: 50,
      fetchedCount: 50,
      includeTotal: false,
    })).toBe('omit');
  });

  it('usa o comprimento da página 1 incompleta em vez de COUNT', () => {
    expect(shouldCountListTotal({
      page: 1,
      limit: 50,
      fetchedCount: 12,
      includeTotal: true,
    })).toBe('use-fetched');
  });

  it('pede COUNT quando a página 1 veio cheia', () => {
    expect(shouldCountListTotal({
      page: 1,
      limit: 50,
      fetchedCount: 50,
      includeTotal: true,
    })).toBe('query-count');
  });

  it('parseIncludeTotal default é true', () => {
    expect(parseIncludeTotal(null)).toBe(true);
    expect(parseIncludeTotal('')).toBe(true);
    expect(parseIncludeTotal('0')).toBe(false);
    expect(parseIncludeTotal('false')).toBe(false);
    expect(parseIncludeTotal('1')).toBe(true);
  });

  it('resolveListTotal não chama count quando omite', async () => {
    const count = vi.fn(async () => 999);
    const result = await resolveListTotal({
      page: 3,
      limit: 50,
      fetchedCount: 50,
      includeTotal: false,
      count,
    });
    expect(count).not.toHaveBeenCalled();
    expect(result).toEqual({ total: null, pages: null });
  });

  it('applyListPageParams marca includeTotal=0 só depois da página 1', () => {
    const first = new URLSearchParams();
    applyListPageParams(first, 1, 50);
    expect(first.get('limit')).toBe('50');
    expect(first.get('includeTotal')).toBeNull();

    const next = new URLSearchParams();
    applyListPageParams(next, 2, 50);
    expect(next.get('page')).toBe('2');
    expect(next.get('includeTotal')).toBe('0');
  });
});
