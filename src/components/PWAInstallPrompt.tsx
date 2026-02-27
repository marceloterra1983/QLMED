'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Check if dismissed recently
    const dismissedAt = localStorage.getItem('pwa-install-dismissed');
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) {
      setDismissed(true);
      return;
    }

    // Android/Chrome: capture install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS: detect Safari
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
    if (isIOS && isSafari) {
      setShowIOSGuide(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIOSGuide(false);
    localStorage.setItem('pwa-install-dismissed', String(Date.now()));
  };

  if (dismissed) return null;
  if (!deferredPrompt && !showIOSGuide) return null;

  return (
    <div className="mt-4 bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-lg shadow-slate-200/50 dark:shadow-none">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-primary text-[24px] mt-0.5">install_mobile</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-800 dark:text-white">Instalar o QLMED</p>
          {deferredPrompt ? (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Instale o app no seu celular para acesso r&aacute;pido.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleInstall}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-primary to-primary-dark text-white rounded-lg text-xs font-bold shadow-md shadow-primary/30"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Instalar
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Agora n&atilde;o
                </button>
              </div>
            </>
          ) : showIOSGuide ? (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Toque em{' '}
                <span className="inline-flex items-center align-middle px-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <path d="M12 4v-3M12 1l-3 3M12 1l3 3" />
                  </svg>
                </span>{' '}
                <strong>Compartilhar</strong> e depois em <strong>&ldquo;Adicionar &agrave; Tela de In&iacute;cio&rdquo;</strong>
              </p>
              <button
                onClick={handleDismiss}
                className="mt-2 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Entendi
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
