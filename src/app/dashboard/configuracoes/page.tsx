'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

interface Company {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
}

interface NsdocsConfig {
  id: string;
  apiToken: string;
  autoSync: boolean;
  syncInterval: number;
  lastSyncAt: string | null;
}

export default function ConfiguracoesPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [apiToken, setApiToken] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [syncInterval, setSyncInterval] = useState(60);
  const [config, setConfig] = useState<NsdocsConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Carregar empresa única
  useEffect(() => {
    fetch('/api/companies')
      .then(res => res.json())
      .then(data => {
        setCompany(data.companies?.[0] || null);
      })
      .catch(() => toast.error('Erro ao carregar empresa'));
  }, []);

  // Carregar configuração
  useEffect(() => {
    fetch('/api/nsdocs/config')
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          setConfig(data.config);
          setApiToken(data.config.apiToken);
          setAutoSync(data.config.autoSync);
          setSyncInterval(data.config.syncInterval);
        } else {
          setConfig(null);
          setApiToken('');
          setAutoSync(true);
          setSyncInterval(60);
        }
      })
      .catch(() => toast.error('Erro ao carregar configuração'));
  }, []);

  const handleTestConnection = async () => {
    setLoading(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/nsdocs/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken }),
      });
      const data = await res.json();

      if (data.ok) {
        setTestResult({
          ok: true,
          message: `Conexão OK! ${data.empresas?.length || 0} empresa(s) encontrada(s).`,
        });
      } else {
        setTestResult({
          ok: false,
          message: data.error || 'Falha na conexão',
        });
      }
    } catch {
      setTestResult({ ok: false, message: 'Erro de rede' });
      toast.error('Erro de rede ao testar conexão');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);

    try {
      const res = await fetch('/api/nsdocs/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiToken,
          autoSync,
          syncInterval,
        }),
      });
      const data = await res.json();

      if (data.config) {
        setConfig(data.config);
        toast.success('Configuração salva com sucesso!');
      } else {
        toast.error(data.error || 'Erro ao salvar');
      }
    } catch {
      toast.error('Erro de rede ao salvar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Integração NSDocs
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure a conexão com a API NSDocs para sincronizar notas fiscais da SEFAZ automaticamente
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
            config ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${config ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></span>
            {config ? 'Conectado' : 'Não configurado'}
          </span>
        </div>
      </div>

      {/* Instructions Card */}
      <div className="bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-primary dark:text-blue-400 text-[24px] mt-0.5">info</span>
          <div>
            <h3 className="font-bold text-blue-900 dark:text-blue-300 text-sm">Como obter o Token da API</h3>
            <ol className="text-sm text-blue-800 dark:text-blue-400 mt-2 space-y-1 list-decimal list-inside">
              <li>Acesse <a href="https://app.nsdocs.com.br" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-primary">app.nsdocs.com.br</a></li>
              <li>Vá em <strong>Configurações → Integração via API</strong></li>
              <li>Copie o <strong>Token de API</strong> gerado</li>
              <li>Cole aqui abaixo e salve</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">key</span>
            Configuração da API
          </h3>
        </div>

        <div className="p-6 space-y-6">
          {/* Empresa fixa */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/30 rounded-xl">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Empresa fixa</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {company ? `${company.razaoSocial} — ${company.cnpj}` : 'QL MED'}
            </p>
          </div>

          {/* API Token */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Token da API NSDocs
            </label>
            <div className="flex gap-3">
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Cole o token da API aqui..."
                className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all font-mono text-sm"
              />
              <button
                onClick={handleTestConnection}
                disabled={loading || !apiToken}
                className="px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">wifi_tethering</span>
                Testar
              </button>
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
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
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/30 rounded-xl">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">Sincronização Automática</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Buscar novas notas na SEFAZ periodicamente</p>
            </div>
            <button
              onClick={() => setAutoSync(!autoSync)}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                autoSync ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                autoSync ? 'translate-x-6' : 'translate-x-0'
              }`}></span>
            </button>
          </div>

          {/* Sync Interval */}
          {autoSync && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Intervalo de Sincronização
              </label>
              <select
                value={syncInterval}
                onChange={(e) => setSyncInterval(Number(e.target.value))}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
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
          {config?.lastSyncAt && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="material-symbols-outlined text-[16px]">schedule</span>
              Última sincronização: {new Date(config.lastSyncAt).toLocaleString('pt-BR')}
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 flex items-center justify-end">
          <button
            onClick={handleSave}
            disabled={loading || !apiToken}
            className="ml-auto px-6 py-3 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            Salvar Configuração
          </button>
        </div>
      </div>

    </div>
  );
}
