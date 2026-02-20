'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import CollapsibleCard from '@/components/ui/CollapsibleCard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

type Theme = 'light' | 'dark' | 'system';

interface Company {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
}

interface CertificateInfo {
  issuer: string;
  validTo: string;
  cnpjCertificate: string;
  environment: string;
  isExpired: boolean;
}

interface NsdocsConfig {
  id: string;
  apiToken: string;
  autoSync: boolean;
  syncInterval: number;
  lastSyncAt: string | null;
}

export default function SettingsPage() {
  const { data: session } = useSession();

  // Theme
  const [theme, setTheme] = useState<Theme>('system');

  // Notifications
  const [notifyNewInvoices, setNotifyNewInvoices] = useState(true);
  const [notifySyncErrors, setNotifySyncErrors] = useState(true);
  const [weeklyEmail, setWeeklyEmail] = useState(false);

  // Certificate
  const [company, setCompany] = useState<Company | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [certInfo, setCertInfo] = useState<CertificateInfo | null>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certMessage, setCertMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // NSDocs
  const [apiToken, setApiToken] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [syncInterval, setSyncInterval] = useState(60);
  const [nsdocsConfig, setNsdocsConfig] = useState<NsdocsConfig | null>(null);
  const [nsdocsLoading, setNsdocsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── Theme ──
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

  // ── Company ──
  useEffect(() => {
    fetch('/api/companies')
      .then(res => res.json())
      .then(data => setCompany(data.companies?.[0] || null))
      .catch(() => toast.error('Erro ao carregar empresa'));
  }, []);

  // ── Certificate ──
  useEffect(() => {
    loadCertInfo();
  }, []);

  const loadCertInfo = () => {
    setCertInfo(null);
    fetch('/api/certificate/info')
      .then(res => res.json())
      .then(data => {
        if (data.hasCertificate) setCertInfo(data.certificate);
      })
      .catch(() => toast.error('Erro ao carregar certificado'));
  };

  const handleCertUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !certPassword) return;

    setCertLoading(true);
    setCertMessage(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('password', certPassword);

    try {
      const res = await fetch('/api/certificate/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        setCertMessage({ type: 'success', text: 'Certificado enviado e validado com sucesso!' });
        toast.success('Certificado enviado com sucesso!');
        setFile(null);
        setCertPassword('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        loadCertInfo();
      } else {
        setCertMessage({ type: 'error', text: data.error || 'Erro ao enviar certificado' });
        toast.error(data.error || 'Erro ao enviar certificado');
      }
    } catch {
      setCertMessage({ type: 'error', text: 'Erro de conexão' });
      toast.error('Erro de conexão');
    } finally {
      setCertLoading(false);
    }
  };

  const handleCertDelete = async () => {
    setCertLoading(true);
    try {
      await fetch('/api/certificate/info', { method: 'DELETE' });
      setCertInfo(null);
      toast.success('Certificado removido com sucesso.');
    } catch {
      toast.error('Erro ao remover certificado');
    } finally {
      setCertLoading(false);
    }
  };

  // ── NSDocs ──
  useEffect(() => {
    fetch('/api/nsdocs/config')
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          setNsdocsConfig(data.config);
          setApiToken(data.config.apiToken);
          setAutoSync(data.config.autoSync);
          setSyncInterval(data.config.syncInterval);
        }
      })
      .catch(() => toast.error('Erro ao carregar configuração NSDocs'));
  }, []);

  const handleTestConnection = async () => {
    setNsdocsLoading(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/nsdocs/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken }),
      });
      const data = await res.json();

      if (data.ok) {
        setTestResult({ ok: true, message: `Conexão OK! ${data.empresas?.length || 0} empresa(s) encontrada(s).` });
      } else {
        setTestResult({ ok: false, message: data.error || 'Falha na conexão' });
      }
    } catch {
      setTestResult({ ok: false, message: 'Erro de rede' });
      toast.error('Erro de rede ao testar conexão');
    } finally {
      setNsdocsLoading(false);
    }
  };

  const handleNsdocsSave = async () => {
    setNsdocsLoading(true);

    try {
      const res = await fetch('/api/nsdocs/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken, autoSync, syncInterval }),
      });
      const data = await res.json();

      if (data.config) {
        setNsdocsConfig(data.config);
        toast.success('Configuração salva com sucesso!');
      } else {
        toast.error(data.error || 'Erro ao salvar');
      }
    } catch {
      toast.error('Erro de rede ao salvar');
    } finally {
      setNsdocsLoading(false);
    }
  };

  // ── Badge helpers ──
  const certBadge = certInfo
    ? certInfo.isExpired
      ? { label: 'Expirado', color: 'red' as const }
      : { label: 'Válido', color: 'green' as const }
    : { label: 'Não instalado', color: 'yellow' as const };

  const nsdocsBadge = nsdocsConfig
    ? { label: 'Conectado', color: 'green' as const }
    : { label: 'Não configurado', color: 'yellow' as const };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="mb-2">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-primary">settings</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Configurações</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">Preferências e integrações do sistema</p>
          </div>
        </div>
      </div>

      {/* 1. Certificado Digital */}
      <CollapsibleCard icon="verified_user" title="Certificado Digital" defaultOpen badge={certBadge}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Upload Form */}
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Empresa</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 mt-0.5">
                {company ? `${company.razaoSocial} — ${company.cnpj}` : 'QL MED'}
              </p>
            </div>

            <form onSubmit={handleCertUpload} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Arquivo .pfx ou .p12
                </label>
                <input
                  type="file"
                  accept=".pfx,.p12"
                  ref={fileInputRef}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Senha do Certificado
                </label>
                <input
                  type="password"
                  value={certPassword}
                  onChange={(e) => setCertPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                  placeholder="************"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={certLoading || !file || !certPassword}
                className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-primary/30 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {certLoading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
                    Enviando...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                    Instalar Certificado
                  </>
                )}
              </button>
            </form>

            {certMessage && (
              <div className={`p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
                certMessage.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
              }`}>
                <span className="material-symbols-outlined text-[18px]">
                  {certMessage.type === 'success' ? 'check_circle' : 'error'}
                </span>
                {certMessage.text}
              </div>
            )}
          </div>

          {/* Certificate Status */}
          <div>
            {!certInfo ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <span className="material-symbols-outlined text-[48px] mb-2 opacity-50">no_encryption</span>
                <p className="text-sm">Nenhum certificado instalado</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className={`p-3 rounded-xl border ${
                  certInfo.isExpired
                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                    : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`material-symbols-outlined ${certInfo.isExpired ? 'text-red-600' : 'text-green-600'}`}>
                      {certInfo.isExpired ? 'error' : 'check_circle'}
                    </span>
                    <span className={`font-bold text-sm ${certInfo.isExpired ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                      {certInfo.isExpired ? 'Expirado' : 'Válido e Ativo'}
                    </span>
                  </div>
                  <p className="text-xs opacity-80 pl-8">
                    Válido até: {new Date(certInfo.validTo).toLocaleString('pt-BR')}
                  </p>
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <span className="block text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Emitido por</span>
                    <p className="text-slate-800 dark:text-slate-200 break-words text-sm">{certInfo.issuer}</p>
                  </div>
                  <div>
                    <span className="block text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">CNPJ no Certificado</span>
                    <p className="font-mono text-slate-800 dark:text-slate-200 text-sm">{certInfo.cnpjCertificate || 'Não detectado'}</p>
                  </div>
                  <div>
                    <span className="block text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Ambiente</span>
                    <p className="text-slate-800 dark:text-slate-200 capitalize text-sm">{certInfo.environment === 'production' ? 'Produção' : 'Homologação'}</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full mt-2 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                  Remover Certificado
                </button>
              </div>
            )}
          </div>
        </div>
      </CollapsibleCard>

      {/* 2. Integração NSDocs */}
      <CollapsibleCard icon="hub" title="Integração NSDocs" defaultOpen badge={nsdocsBadge}>
        <div className="space-y-4">
          {/* Instructions */}
          <div className="bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-primary dark:text-blue-400 text-[20px] mt-0.5">info</span>
              <div>
                <h4 className="font-bold text-blue-900 dark:text-blue-300 text-xs">Como obter o Token da API</h4>
                <ol className="text-xs text-blue-800 dark:text-blue-400 mt-1 space-y-0.5 list-decimal list-inside">
                  <li>Acesse <a href="https://app.nsdocs.com.br" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-primary">app.nsdocs.com.br</a></li>
                  <li>Vá em <strong>Configurações → Integração via API</strong></li>
                  <li>Copie o <strong>Token de API</strong> gerado</li>
                  <li>Cole aqui abaixo e salve</li>
                </ol>
              </div>
            </div>
          </div>

          {/* API Token */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Token da API NSDocs
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Cole o token da API aqui..."
                className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all font-mono text-sm"
              />
              <button
                onClick={handleTestConnection}
                disabled={nsdocsLoading || !apiToken}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">wifi_tethering</span>
                Testar
              </button>
            </div>

            {testResult && (
              <div className={`mt-2 p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
                testResult.ok
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
              }`}>
                <span className="material-symbols-outlined text-[18px]">
                  {testResult.ok ? 'check_circle' : 'error'}
                </span>
                {testResult.message}
              </div>
            )}
          </div>

          {/* Auto Sync Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/30 rounded-xl">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">Sincronização Automática</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Buscar novas notas na SEFAZ periodicamente</p>
            </div>
            <button
              onClick={() => setAutoSync(!autoSync)}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                autoSync ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
              }`}
              role="switch"
              aria-checked={autoSync}
              aria-label="Sincronização Automática"
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                autoSync ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {/* Sync Interval */}
          {autoSync && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Intervalo de Sincronização
              </label>
              <select
                value={syncInterval}
                onChange={(e) => setSyncInterval(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
              >
                <option value={30}>A cada 30 minutos</option>
                <option value={60}>A cada 1 hora</option>
                <option value={120}>A cada 2 horas</option>
                <option value={360}>A cada 6 horas</option>
                <option value={720}>A cada 12 horas</option>
                <option value={1440}>A cada 24 horas</option>
              </select>
            </div>
          )}

          {/* Last Sync Info */}
          {nsdocsConfig?.lastSyncAt && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="material-symbols-outlined text-[16px]">schedule</span>
              Última sincronização: {new Date(nsdocsConfig.lastSyncAt).toLocaleString('pt-BR')}
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleNsdocsSave}
              disabled={nsdocsLoading || !apiToken}
              className="px-5 py-2.5 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              Salvar Configuração
            </button>
          </div>
        </div>
      </CollapsibleCard>

      {/* 3. Aparência */}
      <CollapsibleCard icon="palette" title="Aparência">
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
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Escolha entre tema claro, escuro ou siga a preferência do seu sistema operacional.
          </p>
        </div>
      </CollapsibleCard>

      {/* 4. Notificações */}
      <CollapsibleCard icon="notifications" title="Notificações">
        <div className="space-y-1">
          <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">Notificar novas notas recebidas</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Receba uma notificação quando novas NF-e forem importadas.</p>
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
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                notifyNewInvoices ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">Notificar erros de sincronização</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Seja avisado quando houver falhas na sincronização com a SEFAZ.</p>
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
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                notifySyncErrors ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">Resumo semanal por e-mail</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Receba um resumo semanal com as principais movimentações fiscais.</p>
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
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                weeklyEmail ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>
      </CollapsibleCard>

      {/* 5. Perfil */}
      <CollapsibleCard icon="person" title="Perfil">
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
      </CollapsibleCard>

      {/* 6. Dados e Exportação */}
      <CollapsibleCard icon="database" title="Dados e Exportação">
        <div className="flex flex-col sm:flex-row gap-3">
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
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
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
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
            </div>
          </div>
        </div>
      </CollapsibleCard>

      {/* 7. Zona de Perigo */}
      <CollapsibleCard icon="warning" title="Zona de Perigo" variant="danger">
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
      </CollapsibleCard>

      {/* Confirm Dialog for Certificate Delete */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleCertDelete}
        title="Remover Certificado"
        message="Tem certeza que deseja remover o certificado? A sincronização direta com a SEFAZ deixará de funcionar."
        confirmLabel="Remover"
        confirmVariant="danger"
      />
    </div>
  );
}
