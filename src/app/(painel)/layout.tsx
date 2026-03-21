'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Sidebar from '@/components/Sidebar';
import { PAGE_LABELS } from '@/components/SidebarNav';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const { actualWidth, collapsed, handleMouseDown, handleToggleCollapse } = useResizableSidebar();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const checkModals = () => setModalOpen(document.querySelector('[role="dialog"]') !== null);
    const observer = new MutationObserver(checkModals);
    observer.observe(document.body, { childList: true, subtree: true });
    checkModals();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.role !== 'admin') return;
    const fetchPending = async () => {
      try {
        const res = await fetch('/api/users/pending-count');
        if (res.ok) setPendingCount((await res.json()).count || 0);
      } catch { /* ignore */ }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 60000);
    return () => clearInterval(interval);
  }, [session?.user?.role]);

  if (!mounted || status !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
        <p className="text-sm text-slate-600 dark:text-slate-300">Carregando painel...</p>
      </div>
    );
  }

  const page = PAGE_LABELS[pathname];

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar
        pathname={pathname}
        session={session}
        collapsed={collapsed}
        actualWidth={actualWidth}
        sidebarOpen={sidebarOpen}
        pendingCount={pendingCount}
        onToggleCollapse={handleToggleCollapse}
        onMouseDown={handleMouseDown}
        onCloseMobile={() => setSidebarOpen(false)}
      />
      <main id="main-content" className="flex-1 min-w-0 flex flex-col h-full relative bg-background-light dark:bg-background-dark">
        <header className={`h-14 flex items-center gap-4 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark flex-shrink-0 z-20 lg:hidden ${modalOpen ? 'hidden' : ''}`}>
          <button onClick={() => setSidebarOpen(true)} aria-label="Abrir menu de navegação" className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white">
            <span className="material-symbols-outlined">menu</span>
          </button>
          {page ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-[20px] text-primary">{page.icon}</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{page.label}</span>
            </div>
          ) : (
            <button onClick={() => { const isDark = document.documentElement.classList.toggle('dark'); localStorage.setItem('qlmed-theme', isDark ? 'dark' : 'light'); }} className="relative w-[100px] h-[30px] cursor-pointer transition-transform hover:scale-105 active:scale-95" title="Alternar tema claro/escuro">
              <Image src="/logo.png" alt="QL MED" fill sizes="100px" className="object-contain dark:brightness-0 dark:invert" />
            </button>
          )}
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-4 py-4 sm:px-6 sm:py-6">
          <div className="max-w-[1600px] min-w-0 mx-auto space-y-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
