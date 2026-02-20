'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { redirect } from 'next/navigation';

interface NavItem {
  label: string;
  icon: string;
  href: string;
  badge?: string;
}

interface NavGroup {
  section: string | null;
  items: NavItem[];
}

const navItems: NavGroup[] = [
  {
    section: null,
    items: [
      { label: 'Dashboard', icon: 'dashboard', href: '/dashboard' },
    ],
  },
  {
    section: 'Fiscal',
    items: [
      { label: 'NF-e Recebidas', icon: 'receipt_long', href: '/dashboard/invoices' },
      { label: 'NF-e Emitidas', icon: 'output', href: '/dashboard/issued' },
      { label: 'CT-e', icon: 'local_shipping', href: '/dashboard/cte' },
    ],
  },
  {
    section: 'Cadastros',
    items: [
      { label: 'Fornecedores', icon: 'storefront', href: '/dashboard/fornecedores' },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { label: 'Sincronizar', icon: 'cloud_sync', href: '/dashboard/sync' },
      { label: 'Erros', icon: 'warning', href: '/dashboard/errors' },
      { label: 'Upload XML', icon: 'cloud_upload', href: '/dashboard/upload' },
      { label: 'Certificado Digital', icon: 'verified_user', href: '/dashboard/certificado' },
      { label: 'Integração NSDocs', icon: 'hub', href: '/dashboard/configuracoes' },
      { label: 'Configurações', icon: 'settings', href: '/dashboard/settings' },
    ],
  },
];

const SIDEBAR_MIN = 64;
const SIDEBAR_DEFAULT = 256;
const SIDEBAR_MAX = 360;

function SidebarContent({
  pathname,
  session,
  collapsed,
  onNavClick,
  onToggleCollapse,
}: {
  pathname: string;
  session: any;
  collapsed: boolean;
  onNavClick?: () => void;
  onToggleCollapse?: () => void;
}) {
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
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          title={collapsed ? 'Sair' : undefined}
          className={`flex items-center w-full rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-100 dark:hover:border-slate-700 ${
            collapsed ? 'justify-center p-2' : 'gap-3 p-2 text-left shadow-sm hover:shadow-md'
          }`}
        >
          <div className="relative flex-shrink-0">
            <div className={`rounded-full border-2 border-primary/30 bg-primary/10 flex items-center justify-center ${collapsed ? 'w-9 h-9' : 'w-10 h-10'}`}>
              <span className="material-symbols-outlined text-primary text-[20px]">person</span>
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-accent rounded-full border-2 border-white dark:border-card-dark" />
          </div>
          {!collapsed && (
            <>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {session?.user?.name || 'Usuário'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {session?.user?.email || ''}
                </span>
              </div>
              <span className="material-symbols-outlined text-slate-400 text-[20px]">logout</span>
            </>
          )}
        </button>
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
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [collapsed, setCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleToggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      if (!prev) {
        // Collapsing - store current width for later
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

  if (status === 'unauthenticated') {
    redirect('/login');
  }

  const actualWidth = collapsed ? SIDEBAR_MIN : sidebarWidth;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <a href="#main-content" className="skip-link">Pular para conteúdo principal</a>

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
