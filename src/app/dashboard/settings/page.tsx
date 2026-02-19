'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

type Theme = 'light' | 'dark' | 'system';

export default function SettingsPage() {
  const { data: session } = useSession();

  const [theme, setTheme] = useState<Theme>('system');
  const [notifyNewInvoices, setNotifyNewInvoices] = useState(true);
  const [notifySyncErrors, setNotifySyncErrors] = useState(true);
  const [weeklyEmail, setWeeklyEmail] = useState(false);

  // Carregar tema salvo no localStorage
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
      // Sistema: usar preferência do SO
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

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-[24px]">settings</span>
          </span>
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Configurações
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-0.5">
              Preferências do sistema e da sua conta.
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Perfil do Usuário */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">person</span>
            Perfil do Usuário
          </h3>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Nome
            </label>
            <input
              type="text"
              value={session?.user?.name || ''}
              readOnly
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm cursor-not-allowed opacity-70"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              E-mail
            </label>
            <input
              type="email"
              value={session?.user?.email || ''}
              readOnly
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm cursor-not-allowed opacity-70"
            />
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 flex justify-end">
          <div className="relative group">
            <button
              disabled
              className="px-5 py-2.5 bg-primary/50 text-white rounded-xl font-bold text-sm cursor-not-allowed flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              Salvar Alterações
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Em breve
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-700"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Aparência */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">palette</span>
            Aparência
          </h3>
        </div>

        <div className="p-6">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
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
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
            Escolha entre tema claro, escuro ou siga a preferência do seu sistema operacional.
          </p>
        </div>
      </div>

      {/* Section 3: Notificações */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">notifications</span>
            Notificações
          </h3>
        </div>

        <div className="p-6 space-y-1">
          {/* Toggle: Novas notas */}
          <div className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">
                Notificar novas notas recebidas
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Receba uma notificação quando novas NF-e forem importadas.
              </p>
            </div>
            <button
              onClick={() => setNotifyNewInvoices(!notifyNewInvoices)}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                notifyNewInvoices ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
              }`}
              role="switch"
              aria-checked={notifyNewInvoices}
              aria-label="Notificar novas notas recebidas"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  notifyNewInvoices ? 'translate-x-6' : 'translate-x-0'
                }`}
              ></span>
            </button>
          </div>

          {/* Toggle: Erros de sincronização */}
          <div className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">
                Notificar erros de sincronização
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Seja avisado quando houver falhas na sincronização com a SEFAZ.
              </p>
            </div>
            <button
              onClick={() => setNotifySyncErrors(!notifySyncErrors)}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                notifySyncErrors ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
              }`}
              role="switch"
              aria-checked={notifySyncErrors}
              aria-label="Notificar erros de sincronização"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  notifySyncErrors ? 'translate-x-6' : 'translate-x-0'
                }`}
              ></span>
            </button>
          </div>

          {/* Toggle: Resumo semanal */}
          <div className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">
                Resumo semanal por e-mail
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Receba um resumo semanal com as principais movimentações fiscais.
              </p>
            </div>
            <button
              onClick={() => setWeeklyEmail(!weeklyEmail)}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                weeklyEmail ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
              }`}
              role="switch"
              aria-checked={weeklyEmail}
              aria-label="Resumo semanal por e-mail"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  weeklyEmail ? 'translate-x-6' : 'translate-x-0'
                }`}
              ></span>
            </button>
          </div>
        </div>
      </div>

      {/* Section 4: Dados e Exportação */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">database</span>
            Dados e Exportação
          </h3>
        </div>

        <div className="p-6 flex flex-col sm:flex-row gap-3">
          <div className="relative group">
            <button
              disabled
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-xl font-semibold text-sm cursor-not-allowed border border-slate-200 dark:border-slate-700"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Exportar todos os dados (CSV)
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Em breve
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-700"></div>
            </div>
          </div>

          <div className="relative group">
            <button
              disabled
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-xl font-semibold text-sm cursor-not-allowed border border-slate-200 dark:border-slate-700"
            >
              <span className="material-symbols-outlined text-[18px]">folder_zip</span>
              Exportar XMLs em lote
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Em breve
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-700"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 5: Zona de Perigo */}
      <div className="bg-white dark:bg-card-dark rounded-xl border-2 border-red-200 dark:border-red-900/50 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-red-200 dark:border-red-900/50">
          <h3 className="font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px]">warning</span>
            Zona de Perigo
          </h3>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
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
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-700"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
