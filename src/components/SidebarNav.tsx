'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { Session } from 'next-auth';

export const PAGE_LABELS: Record<string, { label: string; icon: string }> = {
  '/visaogeral': { label: 'Visão Geral', icon: 'dashboard' },
  '/cadastro/produtos': { label: 'Produtos', icon: 'inventory_2' },
  '/cadastro/clientes': { label: 'Clientes', icon: 'group' },
  '/cadastro/fornecedores': { label: 'Fornecedores', icon: 'storefront' },
  '/estoque/entrada-nfe': { label: 'Entrada NF-e', icon: 'inventory' },
  '/fiscal/invoices': { label: 'NF-e Recebidas', icon: 'receipt_long' },
  '/fiscal/issued': { label: 'NF-e Emitidas', icon: 'output' },
  '/fiscal/nfse-recebidas': { label: 'NFS-e', icon: 'description' },
  '/fiscal/cte': { label: 'CT-e', icon: 'local_shipping' },
  '/fiscal/dashboard': { label: 'Impostos', icon: 'monitoring' },
  '/financeiro/contas-pagar': { label: 'Contas a Pagar', icon: 'payments' },
  '/financeiro/contas-receber': { label: 'Contas a Receber', icon: 'request_quote' },
  '/relatorios/valvulas-importadas': { label: 'Válvulas Mecânicas Corcym', icon: 'bar_chart' },
  '/sistema/sync': { label: 'Sincronizar', icon: 'cloud_sync' },
  '/sistema/errors': { label: 'Erros', icon: 'warning' },
  '/sistema/upload': { label: 'Upload XML', icon: 'cloud_upload' },
  '/sistema/settings': { label: 'Configurações', icon: 'settings' },
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

function buildNavItems(session: Session | null, pendingCount: number): NavGroup[] {
  const role = session?.user?.role || 'viewer';
  const isAdmin = role === 'admin';
  const allowedPages: string[] = session?.user?.allowedPages ?? [];
  const hasPageAccess = (path: string) => isAdmin || allowedPages.length === 0 || allowedPages.includes(path);

  const allNavItems: NavGroup[] = [
    {
      section: null,
      items: [
        { label: 'Visão Geral', icon: 'dashboard', href: '/visaogeral' },
      ],
    },
    {
      section: 'Cadastros',
      items: [
        { label: 'Produtos', icon: 'inventory_2', href: '/cadastro/produtos' },
        { label: 'Clientes', icon: 'group', href: '/cadastro/clientes' },
        { label: 'Fornecedores', icon: 'storefront', href: '/cadastro/fornecedores' },
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
  const navItems = buildNavItems(session, pendingCount);

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
          >
            <Image src="/logo.png" alt="QL MED" fill sizes="28px" className="object-contain dark:brightness-0 dark:invert" priority />
          </button>
        ) : (
          <button
            onClick={() => {
              const isDark = document.documentElement.classList.toggle('dark');
              localStorage.setItem('qlmed-theme', isDark ? 'dark' : 'light');
            }}
            className="relative w-[110px] h-[34px] flex-shrink-0 cursor-pointer transition-transform hover:scale-105 active:scale-95"
            title="Alternar tema claro/escuro"
          >
            <Image src="/logo.png" alt="QL MED" fill sizes="110px" className="object-contain dark:brightness-0 dark:invert" priority />
          </button>
        )}
        {!collapsed && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="flex-shrink-0 p-1 rounded text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors"
            title="Colapsar sidebar"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          </button>
        )}
        {collapsed && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors"
            title="Expandir sidebar"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1">
        {navItems.map((group, groupIdx) => (
          <div key={groupIdx}>
            {group.section && !collapsed && (
              <div className="px-3 pt-4 pb-2">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  {group.section}
                </p>
              </div>
            )}
            {group.section && collapsed && (
              <div className="my-2 mx-2 h-px bg-slate-200 dark:bg-slate-700" />
            )}
            {group.items.map((item) => {
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
                      ? `bg-primary/10 text-primary ${collapsed ? '' : 'border-l-4 border-primary'}`
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[22px] ${
                      isActive
                        ? ''
                        : 'text-slate-400 group-hover:text-primary dark:text-slate-500 dark:group-hover:text-primary-dark'
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
                    <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
