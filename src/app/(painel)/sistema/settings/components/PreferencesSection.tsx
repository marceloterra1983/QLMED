'use client';

import { useState, useEffect, useCallback } from 'react';
import Section from '@/components/ui/Section';
import Button from '@/components/ui/Button';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

type Theme = 'light' | 'dark' | 'system';

interface EffectivePreference {
  eventType: string;
  enabled: boolean;
  isDefault: boolean;
}

/** Rótulos por tipo de evento. Só tipos com produtor aparecem (SPEC-010 D3). */
const PREFERENCE_LABELS: Record<string, { title: string; description: string }> = {
  invoice_received: {
    title: 'Notificar novas notas recebidas',
    description: 'Receba uma notificação quando novas NF-e forem importadas.',
  },
};

export default function PreferencesSection() {
  const { data: session } = useSession();
  const [theme, setTheme] = useState<Theme>('system');
  const [preferences, setPreferences] = useState<EffectivePreference[]>([]);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [savingType, setSavingType] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('qlmed-theme') as Theme | null;
    if (saved) {
      setTheme(saved);
      applyTheme(saved);
    }
  }, []);

  function applyTheme(value: Theme) {
    if (value === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (value === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }

  function handleThemeChange(value: Theme) {
    setTheme(value);
    localStorage.setItem('qlmed-theme', value);
    applyTheme(value);
  }

  useEffect(() => {
    let cancelled = false;
    fetch('/api/users/me/notification-preferences')
      .then((res) => {
        if (!res.ok) throw new Error('Falha ao carregar preferências');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setPreferences(data.preferences || []);
      })
      .catch(() => {
        if (!cancelled) toast.error('Não foi possível carregar suas preferências de notificação');
      })
      .finally(() => {
        if (!cancelled) setLoadingPreferences(false);
      });
    return () => { cancelled = true; };
  }, []);

  /**
   * O interruptor só muda de aparência com a resposta do servidor (FR-004).
   * O defeito que esta feature corrige era exatamente o contrário: o controle
   * mudava de cor sem nada ter sido salvo.
   */
  const togglePreference = useCallback(async (eventType: string, next: boolean) => {
    setSavingType(eventType);
    try {
      const res = await fetch('/api/users/me/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: [{ eventType, enabled: next }] }),
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      const data = await res.json();
      setPreferences(data.preferences || []);
    } catch {
      toast.error('Não foi possível salvar. A preferência continua como estava.');
    } finally {
      setSavingType(null);
    }
  }, []);

  return (
    <>
      {/* Aparência */}
      <Section icon="palette" title="Aparência" defaultOpen={false}>
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Tema
          </label>
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 w-fit">
            <button
              onClick={() => handleThemeChange('light')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded transition-all ${
                theme === 'light'
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">light_mode</span>
              Claro
            </button>
            <button
              onClick={() => handleThemeChange('dark')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded transition-all ${
                theme === 'dark'
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">dark_mode</span>
              Escuro
            </button>
            <button
              onClick={() => handleThemeChange('system')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded transition-all ${
                theme === 'system'
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">desktop_windows</span>
              Sistema
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Escolha entre tema claro, escuro ou siga a preferência do seu sistema operacional.
          </p>
        </div>
      </Section>

      {/* Notificações */}
      <Section icon="notifications" title="Notificações" defaultOpen={false}>
        {loadingPreferences ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 p-3">Carregando preferências...</p>
        ) : preferences.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 p-3">
            Nenhuma preferência de notificação disponível.
          </p>
        ) : (
          <div className="space-y-1">
            {preferences.map((pref) => {
              const label = PREFERENCE_LABELS[pref.eventType];
              if (!label) return null;
              const saving = savingType === pref.eventType;
              return (
                <div
                  key={pref.eventType}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">{label.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label.description}</p>
                  </div>
                  <button
                    onClick={() => togglePreference(pref.eventType, !pref.enabled)}
                    disabled={saving}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 disabled:opacity-60 ${
                      pref.enabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                    role="switch"
                    aria-checked={pref.enabled}
                    aria-label={label.title}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                      pref.enabled ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              );
            })}
            <p className="text-xs text-slate-500 dark:text-slate-400 px-3 pt-2">
              Alterações são salvas automaticamente.
            </p>
          </div>
        )}
      </Section>

      {/* Perfil */}
      <Section icon="person" title="Perfil" defaultOpen={false}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nome</label>
            <input
              type="text"
              value={session?.user?.name || ''}
              readOnly
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm cursor-not-allowed opacity-70"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">E-mail</label>
            <input
              type="email"
              value={session?.user?.email || ''}
              readOnly
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm cursor-not-allowed opacity-70"
            />
          </div>
        </div>
      </Section>

      {/* Dados e Exportação */}
      <Section icon="storage" title="Dados e Exportação" defaultOpen={false}>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative group">
            <Button disabled variant="secondary" icon="download">
              Exportar todos os dados (CSV)
            </Button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Em breve
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
            </div>
          </div>

          <div className="relative group">
            <Button disabled variant="secondary" icon="folder_zip">
              Exportar XMLs em lote
            </Button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Em breve
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
            </div>
          </div>
        </div>
      </Section>

      {/* Zona de Perigo */}
      <Section icon="warning" title="Zona de Perigo" variant="danger" defaultOpen={false}>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Ações irreversíveis que afetam permanentemente sua conta e todos os dados associados.
          </p>
          <div className="relative group w-fit">
            <button
              disabled
              className="flex items-center gap-2 px-5 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-400 dark:text-red-500 rounded-xl font-bold text-sm cursor-not-allowed border border-red-200 dark:border-red-800"
            >
              <span className="material-symbols-outlined text-[18px]">delete_forever</span>
              Excluir minha conta
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Em breve
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
