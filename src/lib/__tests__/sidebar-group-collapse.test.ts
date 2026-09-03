import { describe, expect, it } from 'vitest';
import {
  ensureActiveSectionExpanded,
  parseCollapsedGroups,
  sectionForPath,
  serializeCollapsedGroups,
  toggleSidebarCollapsedGroup,
} from '@/lib/sidebar-group-collapse';

describe('sidebar-group-collapse', () => {
  it('parse: vazio e inválido viram Set vazio', () => {
    expect(parseCollapsedGroups(null).size).toBe(0);
    expect(parseCollapsedGroups('not-json').size).toBe(0);
    expect(parseCollapsedGroups('{}').size).toBe(0);
  });

  it('parse/serialize round-trip estável', () => {
    const set = new Set(['Fiscal', 'Sistema']);
    const raw = serializeCollapsedGroups(set);
    expect(JSON.parse(raw)).toEqual(['Fiscal', 'Sistema']);
    expect([...parseCollapsedGroups(raw)].sort()).toEqual(['Fiscal', 'Sistema']);
  });

  it('toggle adiciona e remove seção', () => {
    let s = new Set<string>();
    s = toggleSidebarCollapsedGroup(s, 'Fiscal');
    expect(s.has('Fiscal')).toBe(true);
    s = toggleSidebarCollapsedGroup(s, 'Fiscal');
    expect(s.has('Fiscal')).toBe(false);
  });

  it('ensureActiveSectionExpanded abre só a seção ativa', () => {
    const collapsed = new Set(['Fiscal', 'Sistema']);
    const next = ensureActiveSectionExpanded(collapsed, 'Fiscal');
    expect(next.has('Fiscal')).toBe(false);
    expect(next.has('Sistema')).toBe(true);
    expect(ensureActiveSectionExpanded(collapsed, null)).toBe(collapsed);
  });

  it('sectionForPath resolve pelo href', () => {
    const groups = [
      { section: 'Cadastros', items: [{ href: '/cadastro/produtos' }] },
      { section: 'Fiscal', items: [{ href: '/fiscal/issued' }] },
    ];
    expect(sectionForPath(groups, '/fiscal/issued')).toBe('Fiscal');
    expect(sectionForPath(groups, '/nope')).toBeNull();
  });
});
