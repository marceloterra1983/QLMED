'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<'android' | 'ios' | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Dismissed recently (7 days)
    const dismissedAt = localStorage.getItem('pwa-install-dismissed');
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) return;

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    const isMobile = isIOS || isAndroid || /Mobile/.test(ua);

    if (!isMobile) return;

    if (isIOS) {
      setPlatform('ios');
      setVisible(true);
    } else {
      setPlatform('android');
      setVisible(true);
    }

    // Capture Chrome install prompt if available
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem('pwa-install-dismissed', String(Date.now()));
  };

  if (!visible) return null;

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
          ) : platform === 'ios' ? (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                No Safari, toque em{' '}
                <span className="inline-flex items-center align-middle">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-primary inline">
                    <rect x="5" y="5" width="14" height="14" rx="2" />
                    <path d="M12 5V2M9 4l3-2 3 2" />
                  </svg>
                </span>{' '}
                <strong>Compartilhar</strong> e depois em <strong>&ldquo;Adicionar &agrave; Tela de In&iacute;cio&rdquo;</strong>
              </p>
              <button
                onClick={handleDismiss}
                className="mt-2 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
              >
                Entendi
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                No Chrome, toque no menu{' '}
                <strong>&#8942;</strong> (tr&ecirc;s pontinhos) e depois em{' '}
                <strong>&ldquo;Adicionar &agrave; tela inicial&rdquo;</strong> ou{' '}
                <strong>&ldquo;Instalar aplicativo&rdquo;</strong>
              </p>
              <button
                onClick={handleDismiss}
                className="mt-2 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
              >
                Entendi
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
