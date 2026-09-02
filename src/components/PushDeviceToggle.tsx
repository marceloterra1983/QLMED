'use client';

import { useCallback, useEffect, useState } from 'react';
import Section from '@/components/ui/Section';
import { toast } from 'sonner';

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function PushDeviceToggle() {
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [localOn, setLocalOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const refreshLocal = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setLocalOn(false);
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    setLocalOn(Boolean(subscription));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/users/me/push-subscription')
      .then((res) => {
        if (!res.ok) throw new Error('status');
        return res.json();
      })
      .then(async (data) => {
        if (cancelled) return;
        setVapidPublicKey(typeof data.vapidPublicKey === 'string' ? data.vapidPublicKey : null);
        await refreshLocal();
      })
      .catch(() => {
        if (!cancelled) toast.error('Não foi possível verificar o aviso neste aparelho');
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshLocal]);

  const enable = async () => {
    if (!vapidPublicKey) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      toast.error('Este navegador não suporta aviso no aparelho');
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Permissão recusada. Sem ela o telefone não toca.');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const res = await fetch('/api/users/me/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error('save');
      setLocalOn(true);
      toast.success('Este aparelho vai tocar quando chegar uma nota');
    } catch {
      toast.error('Não foi possível ativar o aviso neste aparelho');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/users/me/push-subscription', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setLocalOn(false);
      toast.success('Aviso neste aparelho desligado');
    } catch {
      toast.error('Não foi possível desligar o aviso neste aparelho');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section icon="smartphone" title="Aviso neste aparelho" defaultOpen={false}>
      {!ready ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 p-3">Verificando este aparelho...</p>
      ) : !vapidPublicKey ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 p-3">
          O aviso no celular ainda não está ligado no servidor.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-4 p-3">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white text-sm">
              Tocar quando chegar uma nota
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              No iPhone, instale o QLMED pela Tela de Início do Safari. Sem enquete no WhatsApp.
            </p>
          </div>
          <button
            type="button"
            onClick={localOn ? disable : enable}
            disabled={busy}
            className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 disabled:opacity-60 ${
              localOn ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
            }`}
            role="switch"
            aria-checked={localOn}
            aria-label="Avisar neste aparelho"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                localOn ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}
    </Section>
  );
}
