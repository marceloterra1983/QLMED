import { describe, it, expect } from 'vitest';
import type { Invoice } from '@/types';
import {
  resolveCollapsedGroupsAfterFetch,
  defaultNfeCollapsedKeys,
  retainExpandedIds,
  nfeProdutoExpandKey,
  isCollapsibleDateGroup,
  dateGroupItemsVisible,
  collapsibleDateGroupKeys,
} from '@/lib/list-collapse';

function invoice(id: string, issueDate: string): Invoice {
  return {
    id,
    accessKey: id,
    type: 'NFE',
    direction: 'issued',
    number: id,
    series: '1',
    issueDate,
    senderCnpj: '00000000000000',
    senderName: 'Emitente',
    recipientCnpj: null,
    recipientName: null,
    totalValue: 10,
    status: 'confirmed',
  };
}

describe('resolveCollapsedGroupsAfterFetch', () => {
  const defaults = ['semana_passada', 'mes_2026-01', 'mes_2026-02'];

  it('primeiro load aplica colapso padrão e marca init', () => {
    const result = resolveCollapsedGroupsAfterFetch({
      preserve: false,
      resetToExpanded: false,
      alreadyInitialized: false,
      defaultCollapsed: defaults,
    });
    expect(result.initialized).toBe(true);
    expect(result.collapsed).toEqual(new Set(defaults));
  });

  it('refetch silencioso preserva expand mesmo com init stale (bug do poll)', () => {
    const result = resolveCollapsedGroupsAfterFetch({
      preserve: true,
      resetToExpanded: false,
      alreadyInitialized: false,
      defaultCollapsed: defaults,
    });
    expect(result.collapsed).toBeNull();
    expect(result.initialized).toBe(false);
  });

  it('refetch após init não reaplica o padrão', () => {
    const result = resolveCollapsedGroupsAfterFetch({
      preserve: false,
      resetToExpanded: false,
      alreadyInitialized: true,
      defaultCollapsed: defaults,
    });
    expect(result.collapsed).toBeNull();
    expect(result.initialized).toBe(true);
  });

  it('busca explícita expande todos; poll com busca não mexe', () => {
    const searchLoad = resolveCollapsedGroupsAfterFetch({
      preserve: false,
      resetToExpanded: true,
      alreadyInitialized: true,
      defaultCollapsed: defaults,
    });
    expect(searchLoad.collapsed).toEqual(new Set());

    const silentSearch = resolveCollapsedGroupsAfterFetch({
      preserve: true,
      resetToExpanded: true,
      alreadyInitialized: true,
      defaultCollapsed: defaults,
    });
    expect(silentSearch.collapsed).toBeNull();
  });
});

describe('defaultNfeCollapsedKeys', () => {
  it('no recorte de um ano usa chave estável mes_YYYY-MM, não índice', () => {
    const keys = defaultNfeCollapsedKeys([
      invoice('a', '2024-03-10'),
      invoice('b', '2024-01-02'),
      invoice('c', '2024-03-22'),
    ], 2024);
    expect(keys).toEqual(['mes_2024-03', 'mes_2024-01']);
  });

  it('sem recorte de ano não colapsa hoje/esta_semana/semana_passada', () => {
    const now = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const lastWeek = new Date(now);
    lastWeek.setDate(now.getDate() - 10);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 12);
    const keys = defaultNfeCollapsedKeys([
      invoice('today', iso(now) + 'T12:00:00'),
      invoice('week', iso(lastWeek) + 'T12:00:00'),
      invoice('month', iso(lastMonth) + 'T12:00:00'),
    ], null);
    expect(keys.some((k) => k === 'hoje' || k === 'esta_semana' || k === 'semana_passada')).toBe(false);
    expect(keys.every((k) => k.startsWith('mes_'))).toBe(true);
  });
});

describe('retainExpandedIds', () => {
  it('estado expandido sobrevive a atualização da lista pelos ids que ainda existem', () => {
    const kept = retainExpandedIds(
      new Set(['nfe-1', 'nfe-2', 'nfe-gone']),
      ['nfe-2', 'nfe-1', 'nfe-9'],
    );
    expect(kept).toEqual(new Set(['nfe-1', 'nfe-2']));
  });
});

describe('nfeProdutoExpandKey', () => {
  it('não usa índice — chave estável num:codigo', () => {
    expect(nfeProdutoExpandKey({ num: '3', codigo: 'ABC' })).toBe('3:ABC');
    expect(nfeProdutoExpandKey({ num: '3', codigo: 'ABC' }))
      .toBe(nfeProdutoExpandKey({ num: '3', codigo: 'ABC' }));
    expect(nfeProdutoExpandKey({ num: '1', codigo: 'X' }))
      .not.toBe(nfeProdutoExpandKey({ num: '2', codigo: 'X' }));
  });
});

describe('isCollapsibleDateGroup', () => {
  it('recusa buckets relativos por chave e por rótulo', () => {
    for (const value of [
      'hoje', 'Hoje', 'esta_semana', 'Esta semana',
      'semana_passada', 'Semana passada', 'Próxima semana',
    ]) {
      expect(isCollapsibleDateGroup(value)).toBe(false);
    }
  });

  it('aceita meses e grupos que não são bucket relativo', () => {
    for (const value of ['mes_2026-08', 'Agosto/2026', 'Este mês', 'Mês passado', 'Campo Grande']) {
      expect(isCollapsibleDateGroup(value)).toBe(true);
    }
  });
});

describe('dateGroupItemsVisible', () => {
  it('relativos continuam visíveis mesmo se estiverem no Set colapsado', () => {
    const collapsed = new Set(['hoje', 'esta_semana', 'semana_passada', 'mes_2026-08']);
    expect(dateGroupItemsVisible('hoje', collapsed)).toBe(true);
    expect(dateGroupItemsVisible('Esta semana', collapsed)).toBe(true);
    expect(dateGroupItemsVisible('semana_passada', collapsed)).toBe(true);
    expect(dateGroupItemsVisible('mes_2026-08', collapsed)).toBe(false);
  });
});

describe('collapsibleDateGroupKeys', () => {
  it('Recolher ignora buckets relativos', () => {
    expect(collapsibleDateGroupKeys(['hoje', 'esta_semana', 'semana_passada', 'mes_2026-08'])).toEqual(['mes_2026-08']);
  });
});
