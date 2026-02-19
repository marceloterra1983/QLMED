'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

interface Company {
  id: string;
  cnpj: string;
  razaoSocial: string;
}

interface SyncLog {
  id: string;
  companyId: string;
  status: string;
  newDocs: number;
  updatedDocs: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

type SyncState = 'idle' | 'syncing' | 'polling' | 'completed' | 'error';

export default function SyncPage() {
  const { data: session } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [syncResult, setSyncResult] = useState<{ newDocs: number; updatedDocs: number; total: number } | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [hasNsdocsConfig, setHasNsdocsConfig] = useState<boolean | null>(null);
  const [hasCertificate, setHasCertificate] = useState<boolean | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Carregar empresas
  useEffect(() => {
    fetch('/api/companies')
      .then(res => res.json())
      .then(data => {
        setCompanies(data.companies || []);
        if (data.companies?.length > 0) {
          setSelectedCompany(data.companies[0].id);
        }
      })
      .catch(console.error);
  }, []);

  // Carregar logs e verificar configs quando empresa muda
  useEffect(() => {
    if (!selectedCompany) return;

    // Verificar configs
    Promise.all([
      fetch(`/api/nsdocs/config?companyId=${selectedCompany}`).then(r => r.json()),
      fetch(`/api/certificate/info?companyId=${selectedCompany}`).then(r => r.json())
    ]).then(([nsdocsData, certData]) => {
      setHasNsdocsConfig(!!nsdocsData.config);
      setHasCertificate(!!certData.hasCertificate);
    }).catch(() => {
      setHasNsdocsConfig(false);
      setHasCertificate(false);
    });

    // Carregar logs
    loadLogs();
  }, [selectedCompany]);
  
  // ... (cleanup useEffect maintained)

  const loadLogs = () => {
    if (!selectedCompany) return;
    fetch(`/api/nsdocs/sync?companyId=${selectedCompany}`)
      .then(res => res.json())
      .then(data => setLogs(data.logs || []))
      .catch(console.error);
  };

  const handleSync = async () => {
    setSyncState('syncing');
    setSyncMessage('Iniciando sincronização...');
    setSyncResult(null);

    try {
      // 1. Iniciar consulta
      const res = await fetch('/api/nsdocs/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompany }),
      });
      const data = await res.json();

      if (data.error) {
        setSyncState('error');
        setSyncMessage(data.error);
        return;
      }

      const { idConsulta, syncLogId, syncMethod } = data;
      setSyncState('polling');
      
      if (syncMethod === 'sefaz') {
        setSyncMessage('Consultando SEFAZ diretamente...');
      } else {
        setSyncMessage('Consultando via NSDocs...');
      }

      // 2. Polling do resultado
      let attempts = 0;
      const maxAttempts = 30;

      pollingRef.current = setInterval(async () => {
        attempts++;

        try {
          const url = `/api/nsdocs/sync?companyId=${selectedCompany}&syncLogId=${syncLogId}${idConsulta ? `&idConsulta=${idConsulta}` : ''}`;
          const pollRes = await fetch(url);
          const pollData = await pollRes.json();

          if (pollData.status === 'completed') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setSyncState('completed');
            setSyncMessage('Sincronização concluída!');
            setSyncResult({
              newDocs: pollData.newDocs,
              updatedDocs: pollData.updatedDocs,
              total: pollData.totalDocumentos || 0,
            });
            loadLogs();
          } else if (pollData.status === 'error') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setSyncState('error');
            setSyncMessage(pollData.error || 'Erro desconhecido');
            loadLogs();
          } else if (attempts >= maxAttempts) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setSyncState('error');
            setSyncMessage('Timeout: a consulta demorou demais.');
          } else {
            // Ainda rodando
          }
        } catch {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setSyncState('error');
          setSyncMessage('Erro de conexão durante polling');
        }
      }, 3000);
    } catch {
      setSyncState('error');
      setSyncMessage('Erro ao iniciar a consulta');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    const icons: Record<string, string> = {
      running: 'sync',
      completed: 'check_circle',
      error: 'error',
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${styles[status] || styles.error}`}>
        <span className={`material-symbols-outlined text-[14px] ${status === 'running' ? 'animate-spin' : ''}`}>
          {icons[status] || 'help'}
        </span>
        {status === 'running' ? 'Em andamento' : status === 'completed' ? 'Concluído' : 'Erro'}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[28px]">cloud_sync</span>
            Sincronizar SEFAZ
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Baixe notas fiscais direto na SEFAZ com certificado digital, com fallback via NSDocs
          </p>
        </div>
      </div>

      {/* Company Selector */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Empresa
            </label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.razaoSocial} — {c.cnpj}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${
          hasCertificate 
            ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' 
            : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
        }`}>
          <span className="material-symbols-outlined text-[16px]">verified_user</span>
          SEFAZ Direta: {hasCertificate ? 'Ativa' : 'Inativa'}
        </div>
        
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${
          hasNsdocsConfig
            ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
            : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
        }`}>
          <span className="material-symbols-outlined text-[16px]">hub</span>
          Integração NSDocs: {hasNsdocsConfig ? 'Ativa' : 'Inativa'}
        </div>
      </div>

      {/* No Config Warning */}
      {hasCertificate === false && hasNsdocsConfig === false && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-yellow-600 dark:text-yellow-400 text-[24px] mt-0.5">warning</span>
            <div>
              <h3 className="font-bold text-yellow-900 dark:text-yellow-300 text-sm">Nenhuma integração configurada</h3>
              <p className="text-sm text-yellow-800 dark:text-yellow-400 mt-1">
                Para sincronizar notas, configure o <a href="/dashboard/certificado" className="underline font-semibold hover:text-yellow-600">Certificado Digital</a> (Recomendado) ou a <a href="/dashboard/configuracoes" className="underline font-semibold hover:text-yellow-600">Integração NSDocs</a>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sync Action Card */}
      {(hasCertificate || hasNsdocsConfig) && (
        <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-lg">Pesquisa na SEFAZ</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Buscar novas notas fiscais na Receita Federal para o CNPJ da empresa selecionada
                </p>
              </div>
              <button
                onClick={handleSync}
                disabled={syncState === 'syncing' || syncState === 'polling'}
                className="px-6 py-3 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span className={`material-symbols-outlined text-[20px] ${(syncState === 'syncing' || syncState === 'polling') ? 'animate-spin' : ''}`}>
                  {syncState === 'syncing' || syncState === 'polling' ? 'sync' : 'cloud_download'}
                </span>
                {syncState === 'syncing' || syncState === 'polling' ? 'Consultando...' : 'Pesquisar SEFAZ'}
              </button>
            </div>

            {/* Sync Progress */}
            {syncState !== 'idle' && (
              <div className="mt-6">
                {/* Progress Bar */}
                {(syncState === 'syncing' || syncState === 'polling') && (
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 mb-4 overflow-hidden">
                    <div className="bg-gradient-to-r from-primary to-accent h-2 rounded-full animate-pulse" style={{ width: syncState === 'syncing' ? '30%' : '70%' }}></div>
                  </div>
                )}

                {/* Status Message */}
                <div className={`flex items-center gap-2 text-sm font-medium ${
                  syncState === 'completed' ? 'text-green-600 dark:text-green-400' :
                  syncState === 'error' ? 'text-red-600 dark:text-red-400' :
                  'text-primary dark:text-blue-400'
                }`}>
                  <span className="material-symbols-outlined text-[18px]">
                    {syncState === 'completed' ? 'check_circle' : syncState === 'error' ? 'error' : 'hourglass_top'}
                  </span>
                  {syncMessage}
                </div>

                {/* Results */}
                {syncResult && (
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-center border border-green-100 dark:border-green-800">
                      <p className="text-2xl font-bold text-green-700 dark:text-green-400">{syncResult.newDocs}</p>
                      <p className="text-xs text-green-600 dark:text-green-500 font-medium mt-1">Novas notas</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center border border-blue-100 dark:border-blue-800">
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{syncResult.updatedDocs}</p>
                      <p className="text-xs text-blue-600 dark:text-blue-500 font-medium mt-1">Atualizados</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-center border border-slate-200 dark:border-slate-700">
                      <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{syncResult.total}</p>
                      <p className="text-xs text-slate-500 font-medium mt-1">Total consultados</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sync History */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400 text-[20px]">history</span>
            Histórico de Sincronizações
          </h3>
          <button
            onClick={loadLogs}
            className="text-sm text-primary hover:text-primary-dark font-medium flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Atualizar
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[48px]">cloud_off</span>
            <p className="text-slate-500 dark:text-slate-400 mt-3 font-medium">Nenhuma sincronização realizada</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Clique em &ldquo;Pesquisar SEFAZ&rdquo; para buscar notas fiscais
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {logs.map(log => (
              <div key={log.id} className="px-5 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusBadge(log.status)}
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      {formatDate(log.startedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {log.status === 'completed' && (
                      <>
                        <span className="text-green-600 dark:text-green-400 font-semibold">
                          +{log.newDocs} novas
                        </span>
                        <span className="text-primary dark:text-blue-400 font-semibold">
                          {log.updatedDocs} atualizadas
                        </span>
                      </>
                    )}
                    {log.errorMessage && (
                      <span className="text-red-500 dark:text-red-400 text-xs max-w-xs truncate" title={log.errorMessage}>
                        {log.errorMessage}
                      </span>
                    )}
                    {log.completedAt && (
                      <span className="text-slate-400 text-xs">
                        Duração: {Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)}s
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
