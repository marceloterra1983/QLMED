'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import type { Session } from 'next-auth';

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

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Visualizador',
};

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  editor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  viewer: 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400',
};

const SIDEBAR_MIN = 64;
const SIDEBAR_DEFAULT = 256;
const SIDEBAR_MAX = 360;

function SidebarContent({
  pathname,
  session,
  collapsed,
  onNavClick,
  onToggleCollapse,
  pendingCount,
}: {
  pathname: string;
  session: Session | null;
  collapsed: boolean;
  onNavClick?: () => void;
  onToggleCollapse?: () => void;
  pendingCount: number;
}) {
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
      section: 'Fiscal',
      items: [
        { label: 'NF-e Recebidas', icon: 'receipt_long', href: '/fiscal/invoices' },
        { label: 'NF-e Emitidas', icon: 'output', href: '/fiscal/issued' },
        { label: 'CT-e', icon: 'local_shipping', href: '/fiscal/cte' },
      ],
    },
    {
      section: 'Financeiro',
      items: [
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

  // Filter nav items based on allowedPages
  const navItems: NavGroup[] = allNavItems
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.adminOnly || hasPageAccess(item.href)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <div className={`flex flex-col gap-6 ${collapsed ? 'p-3' : 'p-5'}`}>
        {/* Logo row */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {collapsed ? (
            <div className="relative w-[28px] h-[28px] flex-shrink-0">
              <Image src="/logo.png" alt="QL MED" fill sizes="28px" className="object-contain" priority />
            </div>
          ) : (
            <div className="relative w-[110px] h-[34px] flex-shrink-0">
              <Image src="/logo.png" alt="QL MED" fill sizes="110px" className="object-contain" priority />
            </div>
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

      {/* User Profile */}
      <div className={`border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 ${collapsed ? 'p-2' : 'p-4'}`}>
        {/* User info */}
        <div className={`flex items-center ${collapsed ? 'justify-center mb-2' : 'gap-3 mb-3'}`}>
          <div className="relative flex-shrink-0">
            <div className={`rounded-full border-2 border-primary/30 bg-primary/10 flex items-center justify-center ${collapsed ? 'w-9 h-9' : 'w-10 h-10'}`}>
              <span className="material-symbols-outlined text-primary text-[20px]">person</span>
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-accent rounded-full border-2 border-white dark:border-card-dark" />
          </div>
          {!collapsed && (
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {session?.user?.name || 'Usuário'}
                </span>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${ROLE_BADGE_COLORS[role] || ROLE_BADGE_COLORS.viewer}`}>
                  {ROLE_LABELS[role] || role}
                </span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {session?.user?.email || ''}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className={`flex ${collapsed ? 'flex-col items-center gap-1' : 'gap-2'}`}>
          <button
            onClick={() => signOut({ redirect: false }).then(() => { window.location.href = '/login'; })}
            title="Trocar conta"
            className={`flex items-center gap-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors ${
              collapsed ? 'p-2' : 'flex-1 px-3 py-2'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">switch_account</span>
            {!collapsed && <span className="text-xs font-medium">Trocar conta</span>}
          </button>
          <button
            onClick={() => signOut({ redirect: false }).then(() => { window.location.href = '/login'; })}
            title="Sair"
            className={`flex items-center gap-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ${
              collapsed ? 'p-2' : 'flex-1 px-3 py-2'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            {!collapsed && <span className="text-xs font-medium">Sair</span>}
          </button>
        </div>
      </div>
    </>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [collapsed, setCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      if (!prev) {
        setSidebarWidth(SIDEBAR_MIN);
      } else {
        setSidebarWidth(SIDEBAR_DEFAULT);
      }
      return !prev;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  // Fetch pending user count for admin badge
  useEffect(() => {
    if (session?.user?.role !== 'admin') return;
    const fetchPending = async () => {
      try {
        const res = await fetch('/api/users/pending-count');
        if (res.ok) {
          const data = await res.json();
          setPendingCount(data.count || 0);
        }
      } catch { /* ignore */ }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [session?.user?.role]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX));
      setSidebarWidth(newWidth);
      setCollapsed(newWidth <= SIDEBAR_MIN + 10);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const actualWidth = collapsed ? SIDEBAR_MIN : sidebarWidth;

  // Keep the first server/client render deterministic to avoid hydration mismatches
  // caused by session-dependent navigation and browser-only state.
  if (!mounted || status !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
        <p className="text-sm text-slate-600 dark:text-slate-300">Carregando painel...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Desktop */}
      <aside
        ref={sidebarRef}
        style={{ width: actualWidth }}
        className="flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark flex-col justify-between overflow-y-auto overflow-x-hidden custom-scrollbar z-10 hidden lg:flex transition-[width] duration-200 ease-out relative"
      >
        <SidebarContent
          pathname={pathname}
          session={session}
          collapsed={collapsed}
          onToggleCollapse={handleToggleCollapse}
          pendingCount={pendingCount}
        />

        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-20"
        />
      </aside>

      {/* Sidebar - Mobile */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark flex flex-col justify-between overflow-y-auto custom-scrollbar z-40 lg:hidden transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent
          pathname={pathname}
          session={session}
          collapsed={false}
          onNavClick={() => setSidebarOpen(false)}
          pendingCount={pendingCount}
        />
      </aside>

      {/* Main Content */}
      <main id="main-content" className="flex-1 flex flex-col h-full relative overflow-hidden bg-background-light dark:bg-background-dark">
        {/* Mobile-only header */}
        <header className="h-14 flex items-center gap-4 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark flex-shrink-0 z-20 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu de navegação"
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          <div className="relative w-[100px] h-[30px]">
            <Image src="/logo.png" alt="QL MED" fill sizes="100px" className="object-contain" />
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <div className="max-w-[1600px] mx-auto space-y-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
