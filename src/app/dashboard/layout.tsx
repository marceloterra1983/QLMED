'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
    section: 'Documentos',
    items: [
      { label: 'NF-e Recebidas', icon: 'receipt_long', href: '/dashboard/invoices' },
      { label: 'NF-e Emitidas', icon: 'output', href: '/dashboard/issued' },
      { label: 'CT-e', icon: 'local_shipping', href: '/dashboard/cte' },
      { label: 'Sincronizar', icon: 'cloud_sync', href: '/dashboard/sync' },
      { label: 'Erros', icon: 'warning', href: '/dashboard/errors' },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { label: 'Upload XML', icon: 'cloud_upload', href: '/dashboard/upload' },
      { label: 'Certificado Digital', icon: 'verified_user', href: '/dashboard/certificado' },
      { label: 'Integração NSDocs', icon: 'hub', href: '/dashboard/configuracoes' },
      { label: 'Configurações', icon: 'settings', href: '/dashboard/settings' },
    ],
  },
];

function SidebarContent({
  pathname,
  session,
  onNavClick,
}: {
  pathname: string;
  session: any;
  onNavClick?: () => void;
}) {
  return (
    <>
      <div className="p-6 flex flex-col gap-8">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 bg-primary/20 rounded-xl text-primary shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[26px]">receipt_long</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-tight">QLMED</h1>
            <p className="text-primary dark:text-primary-dark text-xs font-bold uppercase tracking-wider">Gestão Fiscal</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-2">
          {navItems.map((group, groupIdx) => (
            <div key={groupIdx}>
              {group.section && (
                <div className="px-3 pt-4 pb-2">
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {group.section}
                  </p>
                </div>
              )}
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavClick}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
                      isActive
                        ? 'bg-primary/10 text-primary border-l-4 border-primary'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined ${
                        isActive
                          ? ''
                          : 'text-slate-400 group-hover:text-primary dark:text-slate-500 dark:group-hover:text-primary-dark'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className={`text-sm ${isActive ? 'font-bold' : 'font-medium'} flex-1`}>
                      {item.label}
                    </span>
                    {item.badge && (
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
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-all text-left shadow-sm hover:shadow-md border border-transparent hover:border-slate-100 dark:hover:border-slate-700"
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-primary/30 bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[20px]">person</span>
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-accent rounded-full border-2 border-white dark:border-card-dark"></span>
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {session?.user?.name || 'Usuário'}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {session?.user?.email || ''}
            </span>
          </div>
          <span className="material-symbols-outlined text-slate-400 text-[20px]">logout</span>
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
  const router = useRouter();
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  if (status === 'unauthenticated') {
    redirect('/login');
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/dashboard/invoices?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

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
      <aside className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark flex flex-col justify-between overflow-y-auto custom-scrollbar z-10 hidden lg:flex">
        <SidebarContent pathname={pathname} session={session} />
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
          onNavClick={() => setSidebarOpen(false)}
        />
      </aside>

      {/* Main Content */}
      <main id="main-content" className="flex-1 flex flex-col h-full relative overflow-hidden bg-background-light dark:bg-background-dark">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark flex-shrink-0 z-20">
          <div className="flex items-center gap-4 lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu de navegação"
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="font-bold text-lg text-slate-900 dark:text-white">QLMED</span>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="hidden lg:flex flex-1 max-w-xl relative mx-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-slate-400 text-[20px]">search</span>
            </div>
            <input
              className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl leading-5 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-primary/50 focus:border-primary sm:text-sm transition-all"
              placeholder="Buscar por Chave de Acesso, Emitente ou CNPJ..."
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button aria-label="Notificações" className="p-2 text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative">
              <span className="material-symbols-outlined text-[24px]">notifications</span>
            </button>
            <Link
              href="/dashboard/upload"
              className="hidden sm:flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40"
            >
              <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
              Importar XML
            </Link>
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
