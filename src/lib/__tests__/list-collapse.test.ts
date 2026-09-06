import { describe, it, expect } from 'vitest';
import type { Invoice } from '@/types';
import {
  resolveCollapsedGroupsAfterFetch,
  defaultNfeCollapsedKeys,
  nfeCollapsibleMonthKeys,
  retainExpandedIds,
  nfeProdutoExpandKey,
  isCollapsibleDateGroup,
  dateGroupItemsVisible,
  collapsibleDateGroupKeys,
  createDateGroupWalker,
  defaultWalkCollapsedKeys,
  isCurrentMonthDateGroup,
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
  const defaults = ['mes_2026-01', 'mes_2026-02'];

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

  it('sem recorte de ano não colapsa hoje; só meses', () => {
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
  it('recusa só Hoje como divisória estática', () => {
    for (const value of ['hoje', 'Hoje']) {
      expect(isCollapsibleDateGroup(value)).toBe(false);
    }
  });

  it('rótulos de semana relativa (removidos) não são especiais — meses/outros colapsam', () => {
    for (const value of ['esta_semana', 'Esta semana', 'semana_passada', 'Semana passada', 'Próxima semana']) {
      expect(isCollapsibleDateGroup(value)).toBe(true);
    }
  });

  it('aceita meses e grupos que não são bucket relativo', () => {
    for (const value of ['mes_2026-08', 'Agosto/2026', 'Este mês', 'Mês passado', 'Campo Grande']) {
      expect(isCollapsibleDateGroup(value)).toBe(true);
    }
  });
});

describe('dateGroupItemsVisible', () => {
  it('Hoje continua visível mesmo se estiver no Set colapsado', () => {
    const collapsed = new Set(['hoje', 'mes_2026-08']);
    expect(dateGroupItemsVisible('hoje', collapsed)).toBe(true);
    expect(dateGroupItemsVisible('mes_2026-08', collapsed)).toBe(false);
  });
});

describe('collapsibleDateGroupKeys', () => {
  it('Recolher ignora Hoje', () => {
    expect(collapsibleDateGroupKeys(['hoje', 'mes_2026-08'])).toEqual(['mes_2026-08']);
  });
});


describe('nfeCollapsibleMonthKeys e defaultNfeCollapsedKeys', () => {
  it('Recolher inclui o mês atual; o load padrão deixa o mês atual expandido', () => {
    const now = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 12);
    const rows = [
      invoice('today', iso(now) + 'T12:00:00'),
      invoice('month', iso(lastMonth) + 'T12:00:00'),
    ];
    const currentKey = `mes_${iso(now).slice(0, 7)}`;
    const lastKey = `mes_${iso(lastMonth).slice(0, 7)}`;
    const collapsible = nfeCollapsibleMonthKeys(rows, null, now);
    expect(collapsible[0]).toBe(currentKey);
    const collapsed = defaultNfeCollapsedKeys(rows, null, now);
    expect(collapsed).not.toContain(currentKey);
    if (lastMonth.getFullYear() === now.getFullYear()) {
      expect(collapsible).toContain(lastKey);
      expect(collapsed).toContain(lastKey);
    }
  });
});

describe('isCurrentMonthDateGroup', () => {
  it('reconhece Este mês e mes_YYYY-MM do calendário atual', () => {
    const now = new Date(2026, 8, 6);
    expect(isCurrentMonthDateGroup('Este mês', now)).toBe(true);
    expect(isCurrentMonthDateGroup('mes_2026-09', now)).toBe(true);
    expect(isCurrentMonthDateGroup('Setembro/2026', now)).toBe(true);
    expect(isCurrentMonthDateGroup('mes_2026-08', now)).toBe(false);
    expect(isCurrentMonthDateGroup('Mês passado', now)).toBe(false);
  });
});

describe('defaultWalkCollapsedKeys', () => {
  it('não colapsa Este mês / mês atual', () => {
    const now = new Date(2026, 8, 6);
    expect(defaultWalkCollapsedKeys(['Hoje', 'Este mês', 'Mês passado'], now))
      .toEqual(['Mês passado']);
  });
});

describe('createDateGroupWalker', () => {
  it('emite o mês atual no topo e oculta filhos quando colapsado', () => {
    const now = new Date(2026, 8, 6, 15, 0, 0);
    const collapsed = new Set(['mes_2026-09']);
    const walk = createDateGroupWalker(collapsed, { now });
    const first = walk('2026-09-06T12:00:00', 'Hoje');
    expect(first.emitParentHeader).toEqual({ key: 'mes_2026-09', label: 'Setembro/2026' });
    expect(first.emitGroupDivider).toBe(false);
    expect(first.showRow).toBe(false);
    const second = walk('2026-09-02T12:00:00', 'Este mês');
    expect(second.emitParentHeader).toBeNull();
    expect(second.showRow).toBe(false);
    const outside = walk('2026-08-28T12:00:00', 'Mês passado');
    expect(outside.emitParentHeader).toBeNull();
    expect(outside.emitGroupDivider).toBe(true);
    expect(outside.showRow).toBe(true);
  });

  it('com mês atual expandido mostra Hoje; Este mês não vira divisória extra', () => {
    const now = new Date(2026, 8, 6, 15, 0, 0);
    const walk = createDateGroupWalker(new Set(), { now });
    const first = walk('2026-09-06T12:00:00', 'Hoje');
    expect(first.emitParentHeader?.key).toBe('mes_2026-09');
    expect(first.emitGroupDivider).toBe(true);
    expect(first.showRow).toBe(true);
    const inner = walk('2026-09-02T12:00:00', 'Este mês');
    expect(inner.emitGroupDivider).toBe(false);
    expect(inner.showRow).toBe(true);
  });

  it('agrupamento que não é data (cidade) não emite mês atual', () => {
    const walk = createDateGroupWalker(new Set(['Campo Grande']), { dateGrouping: false });
    const tick = walk(null, 'Campo Grande');
    expect(tick.emitParentHeader).toBeNull();
    expect(tick.emitGroupDivider).toBe(true);
    expect(tick.showRow).toBe(false);
  });
});
