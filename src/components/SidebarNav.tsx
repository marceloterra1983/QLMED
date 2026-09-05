'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import Image from 'next/image';
import type { Session } from 'next-auth';
import {
  ensureActiveSectionExpanded,
  loadSidebarCollapsedGroups,
  saveSidebarCollapsedGroups,
  sectionForPath,
  toggleSidebarCollapsedGroup,
} from '@/lib/sidebar-group-collapse';

export const PAGE_LABELS: Record<string, { label: string; icon: string }> = {
  '/cadastro/produtos': { label: 'Produtos', icon: 'inventory_2' },
  '/cadastro/clientes': { label: 'Clientes', icon: 'group' },
  '/cadastro/fornecedores': { label: 'Fornecedores', icon: 'storefront' },
  '/cadastro/anvisa': { label: 'ANVISA', icon: 'medication' },
  '/cadastro/documentos': { label: 'Documentos', icon: 'verified' },
  '/estoque/entrada-nfe': { label: 'Entrada NF-e', icon: 'inventory' },
  '/fiscal/invoices': { label: 'NF-e Recebidas', icon: 'receipt_long' },
  '/fiscal/issued': { label: 'NF-e Emitidas', icon: 'output' },
  '/fiscal/nfse-recebidas': { label: 'NFS-e', icon: 'description' },
  '/fiscal/cte': { label: 'CT-e', icon: 'local_shipping' },
  '/fiscal/dashboard': { label: 'Impostos', icon: 'monitoring' },
  '/financeiro/contas-pagar': { label: 'Contas a Pagar', icon: 'payments' },
  '/financeiro/contas-receber': { label: 'Contas a Receber', icon: 'request_quote' },
  '/gestao/impcg': { label: 'IMPCG', icon: 'assignment' },
  '/gestao/cassems': { label: 'CASSEMS', icon: 'clinical_notes' },
  '/relatorios/valvulas-importadas': { label: 'Válvulas Mecânicas Corcym', icon: 'bar_chart' },
  '/sistema/sync': { label: 'Sincronizar', icon: 'cloud_sync' },
  '/sistema/errors': { label: 'Erros', icon: 'warning' },
  '/sistema/upload': { label: 'Upload XML', icon: 'cloud_upload' },
  '/sistema/settings': { label: 'Configurações', icon: 'settings' },
  '/sistema/automacoes': { label: 'Automações', icon: 'account_tree' },
  '/sistema/rotinas': { label: 'Rotinas', icon: 'schedule' },
  '/sistema/usuarios': { label: 'Usuários', icon: 'manage_accounts' },
};

interface NavItem {
  label: string;
  icon: string;
  href: string;
  badge?: string;
  adminOnly?: boolean;
}

interface NavGroup {
  section: string | null;
  items: NavItem[];
}

interface SidebarNavProps {
  pathname: string;
  session: Session | null;
  collapsed: boolean;
  onNavClick?: () => void;
  onToggleCollapse?: () => void;
  pendingCount: number;
}

/**
 * Exportada só para o teste `sidebar-nav-paths`: esta lista é uma TERCEIRA
 * fonte de verdade, ao lado de PAGE_GROUPS (navigation.ts) e PAGE_LABELS.
 * A SPEC-042 acrescentou /cadastro/documentos às duas primeiras e esqueceu
 * esta — a página existia, era autorizada, e não aparecia no menu. O teste
 * iguala os conjuntos de caminhos para o próximo esquecimento reprovar.
 */
export function buildNavItems(session: Session | null, pendingCount: number): NavGroup[] {
  const role = session?.user?.role || 'viewer';
  const isAdmin = role === 'admin';
  const allowedPages: string[] = session?.user?.allowedPages ?? [];
  // Default-deny, mirroring canAccessPage: an empty list grants nothing.
  const hasPageAccess = (path: string) => isAdmin || allowedPages.includes(path);

  const allNavItems: NavGroup[] = [
    {
      section: 'Cadastros',
      items: [
        { label: 'Produtos', icon: 'inventory_2', href: '/cadastro/produtos' },
        { label: 'Clientes', icon: 'group', href: '/cadastro/clientes' },
        { label: 'Fornecedores', icon: 'storefront', href: '/cadastro/fornecedores' },
        { label: 'Documentos', icon: 'verified', href: '/cadastro/documentos' },
      ],
    },
    {
      section: 'Estoque',
      items: [
        { label: 'Entrada NF-e', icon: 'inventory', href: '/estoque/entrada-nfe' },
      ],
    },
    {
      section: 'Fiscal',
      items: [
        { label: 'NF-e Recebidas', icon: 'receipt_long', href: '/fiscal/invoices' },
        { label: 'NF-e Emitidas', icon: 'output', href: '/fiscal/issued' },
        { label: 'NFS-e', icon: 'description', href: '/fiscal/nfse-recebidas' },
        { label: 'CT-e', icon: 'local_shipping', href: '/fiscal/cte' },
      ],
    },
    {
      section: 'Financeiro',
      items: [
        { label: 'Impostos', icon: 'monitoring', href: '/fiscal/dashboard' },
        { label: 'Contas a Pagar', icon: 'payments', href: '/financeiro/contas-pagar' },
        { label: 'Contas a Receber', icon: 'request_quote', href: '/financeiro/contas-receber' },
      ],
    },
    {
      section: 'Gestão',
      items: [
        { label: 'IMPCG', icon: 'assignment', href: '/gestao/impcg' },
        { label: 'CASSEMS', icon: 'clinical_notes', href: '/gestao/cassems' },
      ],
    },
    {
      section: 'Relatórios',
      items: [
        { label: 'Válvulas Mecânicas Corcym', icon: 'bar_chart', href: '/relatorios/valvulas-importadas' },
      ],
    },
    {
      section: 'Sistema',
      items: [
        { label: 'Sincronizar', icon: 'cloud_sync', href: '/sistema/sync' },
        { label: 'Erros', icon: 'warning', href: '/sistema/errors' },
        { label: 'Upload XML', icon: 'cloud_upload', href: '/sistema/upload' },
        { label: 'Configurações', icon: 'settings', href: '/sistema/settings' },
        { label: 'Automações', icon: 'account_tree', href: '/sistema/automacoes' },
        { label: 'Rotinas', icon: 'schedule', href: '/sistema/rotinas' },
        ...(isAdmin ? [{
          label: 'Usuários',
          icon: 'manage_accounts',
          href: '/sistema/usuarios',
          badge: pendingCount > 0 ? String(pendingCount) : undefined,
          adminOnly: true,
        }] : []),
      ],
    },
  ];

  return allNavItems
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.adminOnly || hasPageAccess(item.href)),
    }))
    .filter((group) => group.items.length > 0);
}

export default function SidebarNav({
  pathname,
  session,
  collapsed,
  onNavClick,
  onToggleCollapse,
  pendingCount,
}: SidebarNavProps) {
  const navItems = useMemo(
    () => buildNavItems(session, pendingCount),
    [session, pendingCount],
  );
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCollapsedSections(loadSidebarCollapsedGroups());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const active = sectionForPath(navItems, pathname);
    setCollapsedSections((prev) => ensureActiveSectionExpanded(prev, active));
  }, [pathname, navItems, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveSidebarCollapsedGroups(collapsedSections);
  }, [collapsedSections, hydrated]);

  return (
    <div className={`flex flex-col gap-6 ${collapsed ? 'p-3' : 'p-5'}`}>
      {/* Logo row */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {collapsed ? (
          <button
            onClick={() => {
              const isDark = document.documentElement.classList.toggle('dark');
              localStorage.setItem('qlmed-theme', isDark ? 'dark' : 'light');
            }}
            className="relative w-[28px] h-[28px] flex-shrink-0 cursor-pointer transition-transform hover:scale-110 active:scale-95"
            title="Alternar tema claro/escuro"
            aria-label="Alternar tema claro ou escuro"
          >
            <Image src="/logo.png" alt="QL MED" fill sizes="28px" className="object-contain dark:brightness-0 dark:invert" />
          </button>
        ) : (
          <button
            onClick={() => {
              const isDark = document.documentElement.classList.toggle('dark');
              localStorage.setItem('qlmed-theme', isDark ? 'dark' : 'light');
            }}
            className="relative w-[110px] h-[34px] flex-shrink-0 cursor-pointer transition-transform hover:scale-105 active:scale-95"
            title="Alternar tema claro/escuro"
            aria-label="Alternar tema claro ou escuro"
          >
            <Image src="/logo.png" alt="QL MED" fill sizes="110px" className="object-contain dark:brightness-0 dark:invert" />
          </button>
        )}
        {!collapsed && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="flex-shrink-0 p-1 rounded text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors"
            title="Colapsar sidebar"
            aria-label="Colapsar sidebar"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          </button>
        )}
        {collapsed && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors"
            title="Expandir sidebar"
            aria-label="Expandir sidebar"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1">
        {navItems.map((group, groupIdx) => {
          const section = group.section;
          const sectionCollapsed =
            Boolean(section) && !collapsed && collapsedSections.has(section!);
          return (
          <div key={section ?? `g-${groupIdx}`}>
            {section && !collapsed && (
              <div className="px-1 pt-3 pb-1">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedSections((prev) =>
                      toggleSidebarCollapsedGroup(prev, section),
                    )
                  }
                  aria-expanded={!sectionCollapsed}
                  className="w-full flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-700/40 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  <span
                    className="material-symbols-outlined text-[16px] text-slate-500 dark:text-slate-400 transition-transform duration-200"
                    style={{
                      transform: sectionCollapsed
                        ? 'rotate(-90deg)'
                        : 'rotate(0deg)',
                    }}
                    aria-hidden
                  >
                    expand_more
                  </span>
                  <span className="flex-1 text-left truncate">{section}</span>
                </button>
              </div>
            )}
            {section && collapsed && (
              <div className="my-2 mx-2 h-px bg-slate-200 dark:bg-slate-700" />
            )}
            {!sectionCollapsed &&
              group.items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavClick}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 rounded-lg transition-colors group ${
                    collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                  } ${
                    isActive
                      ? `bg-primary/10 text-primary dark:text-blue-400 ${collapsed ? '' : 'shadow-[inset_4px_0_0_0_#2563eb] dark:shadow-[inset_4px_0_0_0_#60a5fa]'}`
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[22px] ${
                      isActive
                        ? ''
                        : 'text-slate-500 dark:text-slate-400 group-hover:text-primary dark:group-hover:text-blue-400'
                    }`}
                  >
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <span className={`text-sm ${isActive ? 'font-bold' : 'font-medium'} flex-1 truncate`}>
                      {item.label}
                    </span>
                  )}
                  {!collapsed && item.badge && (
                    <Badge tone="danger" dot={false}>{item.badge}</Badge>
                  )}
                </Link>
              );
            })}
          </div>
          );
        })}
      </nav>
    </div>
  );
}
