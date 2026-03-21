'use client';

import { useState, useEffect, useCallback } from 'react';

const SIDEBAR_MIN = 64;
const SIDEBAR_DEFAULT = 256;
const SIDEBAR_MAX = 360;
const STORAGE_KEY = 'qlmed-sidebar-width';
const COLLAPSED_KEY = 'qlmed-sidebar-collapsed';

export interface UseResizableSidebarReturn {
  sidebarWidth: number;
  actualWidth: number;
  collapsed: boolean;
  isResizing: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleToggleCollapse: () => void;
}

export function useResizableSidebar(): UseResizableSidebarReturn {
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [collapsed, setCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Restore persisted state on mount
  useEffect(() => {
    const savedWidth = localStorage.getItem(STORAGE_KEY);
    const savedCollapsed = localStorage.getItem(COLLAPSED_KEY);
    if (savedCollapsed === 'true') {
      setCollapsed(true);
      setSidebarWidth(SIDEBAR_MIN);
    } else if (savedWidth) {
      const w = Number(savedWidth);
      if (w >= SIDEBAR_MIN && w <= SIDEBAR_MAX) {
        setSidebarWidth(w);
        setCollapsed(w <= SIDEBAR_MIN + 10);
      }
    }
  }, []);

  // Persist state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(sidebarWidth));
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [sidebarWidth, collapsed]);

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

  return {
    sidebarWidth,
    actualWidth,
    collapsed,
    isResizing,
    handleMouseDown,
    handleToggleCollapse,
  };
}
