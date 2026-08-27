'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

/** Se o navegador já autorizou, regrava a inscrição (endpoint pode rotacionar). */
export function PushResubscribe() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    let cancelled = false;
    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (cancelled || !subscription) return;
        await fetch('/api/users/me/push-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON()),
        });
      } catch {
        // silencioso: falta de VAPID ou SW ainda nao pronto nao pode quebrar o painel
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  return null;
}
