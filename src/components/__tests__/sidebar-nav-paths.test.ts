import { describe, expect, it } from 'vitest';
import type { Session } from 'next-auth';
import { buildNavItems, PAGE_LABELS } from '@/components/SidebarNav';
import { ALL_PAGES } from '@/lib/navigation';

/**
 * SPEC-042 — o menu tem TRÊS fontes de verdade para as mesmas páginas:
 * PAGE_GROUPS (navigation.ts, que também governa a ACL), PAGE_LABELS e a lista
 * literal dentro de buildNavItems. A SPEC-042 acrescentou /cadastro/documentos
 * às duas primeiras e esqueceu a terceira: a página existia, o utilizador tinha
 * permissão, e o item simplesmente não aparecia no menu. Nenhum teste reprovou,
 * porque nenhum comparava as listas.
 *
 * Enquanto as três existirem, é este teste que as prende. Unificá-las é a
 * correção de raiz, mas hoje as secções e os rótulos divergem de propósito
 * (ex.: /fiscal/dashboard é 'Visão Geral' em Fiscal e 'Impostos' em Financeiro),
 * então o invariante que se pode afirmar sem mudar comportamento é o CONJUNTO
 * de caminhos.
 */
function adminSession(): Session {
  return {
    user: { role: 'admin', allowedPages: [] },
    expires: '2099-01-01T00:00:00.000Z',
  } as unknown as Session;
}

function sidebarPaths(): string[] {
  return buildNavItems(adminSession(), 0).flatMap((group) => group.items.map((item) => item.href));
}

describe('SPEC-042 — as fontes de verdade do menu não podem divergir', () => {
  it('o sidebar cobre exatamente as páginas de PAGE_GROUPS, sem sobra nem falta', () => {
    const navegacao = [...ALL_PAGES.map((page) => page.path)].sort();
    const sidebar = [...sidebarPaths()].sort();

    // Mensagens separadas: quem quebrar isto tem de saber de que lado esqueceu.
    expect(navegacao.filter((path) => !sidebar.includes(path))).toEqual([]);
    expect(sidebar.filter((path) => !navegacao.includes(path))).toEqual([]);
    expect(sidebar).toEqual(navegacao);
  });

  it('toda página do sidebar tem rótulo e ícone em PAGE_LABELS', () => {
    for (const path of sidebarPaths()) {
      expect(PAGE_LABELS[path], `sem PAGE_LABELS para ${path}`).toBeDefined();
      expect(PAGE_LABELS[path].icon).toBeTruthy();
    }
  });

  it('Documentos aparece dentro do grupo Cadastros', () => {
    const cadastros = buildNavItems(adminSession(), 0).find((group) => group.section === 'Cadastros');
    expect(cadastros?.items.map((item) => item.href)).toContain('/cadastro/documentos');
  });
});
