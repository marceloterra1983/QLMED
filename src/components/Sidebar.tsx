'use client';

import { useRef } from 'react';
import type { Session } from 'next-auth';
import SidebarNav from '@/components/SidebarNav';
import UserProfile from '@/components/UserProfile';

interface SidebarProps {
  pathname: string;
  session: Session | null;
  collapsed: boolean;
  actualWidth: number;
  sidebarOpen: boolean;
  pendingCount: number;
  onToggleCollapse: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onCloseMobile: () => void;
}

export default function Sidebar({
  pathname,
  session,
  collapsed,
  actualWidth,
  sidebarOpen,
  pendingCount,
  onToggleCollapse,
  onMouseDown,
  onCloseMobile,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar - Desktop */}
      <aside
        ref={sidebarRef}
        style={{ width: actualWidth }}
        className="flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark flex-col justify-between overflow-y-auto overflow-x-hidden custom-scrollbar z-10 hidden lg:flex transition-[width] duration-200 ease-out relative"
      >
        <SidebarNav
          pathname={pathname}
          session={session}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          pendingCount={pendingCount}
        />
        <UserProfile session={session} collapsed={collapsed} />

        {/* Resize handle */}
        <div
          onMouseDown={onMouseDown}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-20"
        />
      </aside>

      {/* Sidebar - Mobile */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark flex flex-col justify-between overflow-y-auto custom-scrollbar z-40 lg:hidden transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarNav
          pathname={pathname}
          session={session}
          collapsed={false}
          onNavClick={onCloseMobile}
          pendingCount={pendingCount}
        />
        <UserProfile session={session} collapsed={false} />
      </aside>
    </>
  );
}
