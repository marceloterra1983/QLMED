'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function AccessLogTracker() {
  const pathname = usePathname();
  const { status } = useSession();
  const prevPath = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !pathname) return;
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch('/api/access-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'navigation', path: pathname }),
        keepalive: true,
      }).catch(() => {});
    }, 500);
  }, [pathname, status]);

  return null;
}
