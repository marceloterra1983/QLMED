'use client';

import { useState, useEffect } from 'react';
import Section from '@/components/ui/Section';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { formatDateTimeSeconds, formatFileSize } from '@/lib/utils';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';

function formatBytes(bytes: number): string {
  return formatFileSize(bytes);
}

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

interface ReceitaNfseConfig {
  id: string;
  apiToken: string;
  autoSync: boolean;
  syncInterval: number;
  environment: 'production' | 'production-restricted';
  baseUrl: string | null;
  cnpjConsulta: string | null;
  lastNsu: string;
  lastSyncAt: string | null;
}

interface OneDriveConnection {
  id: string;
  accountEmail: string;
  accountName: string | null;
  driveId: string;
  driveType: string | null;
  driveWebUrl: string | null;
  tokenExpiresAt: string;
  lastValidatedAt: string | null;
  updatedAt: string;
  isExpired: boolean;
}

interface OneDriveItem {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  childCount: number | null;
  size: number;
  webUrl: string | null;
  lastModifiedAt: string | null;
}

interface IntegrationsSectionProps {
  company: Company | null;
  canManageSettings: boolean;
}

/** Os estados de integração ainda produzem `{ label, color }`; o Section quer um nó. */
const TOM_DO_BADGE = { green: 'success', red: 'danger', yellow: 'warning' } as const;
const badgeDe = (b?: { label: string; color: keyof typeof TOM_DO_BADGE }) =>
  b ? <Badge tone={TOM_DO_BADGE[b.color]}>{b.label}</Badge> : undefined;

export default function IntegrationsSection({ company, canManageSettings }: IntegrationsSectionProps) {
  // NSDocs
  const [apiToken, setApiToken] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [syncInterval, setSyncInterval] = useState(60);
  const [nsdocsConfig, setNsdocsConfig] = useState<NsdocsConfig | null>(null);
  const [nsdocsLoading, setNsdocsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Receita NFS-e
  const [receitaApiToken, setReceitaApiToken] = useState('');
  const [receitaAutoSync, setReceitaAutoSync] = useState(true);
  const [receitaSyncInterval, setReceitaSyncInterval] = useState(60);
  const [receitaEnvironment, setReceitaEnvironment] = useState<'production' | 'production-restricted'>('production');
  const [receitaBaseUrl, setReceitaBaseUrl] = useState('');
  const [receitaCnpjConsulta, setReceitaCnpjConsulta] = useState('');
  const [receitaConfig, setReceitaConfig] = useState<ReceitaNfseConfig | null>(null);
  const [receitaLoading, setReceitaLoading] = useState(false);
  const [receitaTestResult, setReceitaTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // OneDrive
  const [oneDriveLoginHint, setOneDriveLoginHint] = useState('faturamento@qlmed.com.br');
  const [oneDriveConnections, setOneDriveConnections] = useState<OneDriveConnection[]>([]);
  const [oneDriveLoading, setOneDriveLoading] = useState(false);
  const [pendingDisconnectId, setPendingDisconnectId] = useState<string | null>(null);
  const [oneDriveFilesLoading, setOneDriveFilesLoading] = useState(false);
  const [selectedOneDriveConnectionId, setSelectedOneDriveConnectionId] = useState<string | null>(null);
  const [oneDriveItems, setOneDriveItems] = useState<OneDriveItem[]>([]);
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

  useEffect(() => {
    fetch('/api/receita/nfse/config')
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          setReceitaConfig(data.config);
          setReceitaApiToken(data.config.apiToken || '');
          setReceitaAutoSync(Boolean(data.config.autoSync));
          setReceitaSyncInterval(Number(data.config.syncInterval || 60));
          setReceitaEnvironment(data.config.environment === 'production-restricted' ? 'production-restricted' : 'production');
          setReceitaBaseUrl(data.config.baseUrl || '');
          setReceitaCnpjConsulta(data.config.cnpjConsulta || '');
        } else if (company?.cnpj) {
          setReceitaCnpjConsulta(company.cnpj);
        }
      })
      .catch(() => toast.error('Erro ao carregar configuração Receita NFS-e'));
  }, [company?.cnpj]);

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

  const handleReceitaTestConnection = async () => {
    setReceitaLoading(true);
    setReceitaTestResult(null);

    try {
      const res = await fetch('/api/receita/nfse/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiToken: receitaApiToken,
          environment: receitaEnvironment,
          baseUrl: receitaBaseUrl,
          cnpjConsulta: receitaCnpjConsulta || company?.cnpj || '',
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setReceitaTestResult({ ok: true, message: data.message || 'Conexão Receita NFS-e OK!' });
      } else {
        setReceitaTestResult({ ok: false, message: data.error || 'Falha ao testar conexão Receita NFS-e' });
      }
    } catch {
      setReceitaTestResult({ ok: false, message: 'Erro de rede ao testar conexão Receita NFS-e' });
    } finally {
      setReceitaLoading(false);
    }
  };

  const handleReceitaSave = async () => {
    setReceitaLoading(true);

    try {
      const res = await fetch('/api/receita/nfse/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiToken: receitaApiToken,
          autoSync: receitaAutoSync,
          syncInterval: receitaSyncInterval,
          environment: receitaEnvironment,
          baseUrl: receitaBaseUrl || null,
          cnpjConsulta: receitaCnpjConsulta || company?.cnpj || null,
        }),
      });
      const data = await res.json();

      if (data.config) {
        setReceitaConfig(data.config);
        setReceitaApiToken(data.config.apiToken || '');
        setReceitaAutoSync(Boolean(data.config.autoSync));
        setReceitaSyncInterval(Number(data.config.syncInterval || 60));
        setReceitaEnvironment(data.config.environment === 'production-restricted' ? 'production-restricted' : 'production');
        setReceitaBaseUrl(data.config.baseUrl || '');
        setReceitaCnpjConsulta(data.config.cnpjConsulta || '');
        toast.success('Configuração Receita NFS-e salva com sucesso!');
      } else {
        toast.error(data.error || 'Erro ao salvar configuração Receita NFS-e');
      }
    } catch {
      toast.error('Erro de rede ao salvar configuração Receita NFS-e');
    } finally {
      setReceitaLoading(false);
    }
  };

  // ── OneDrive ──
  const loadOneDriveConnections = async () => {
    try {
      const res = await fetch('/api/onedrive/connections');
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar conexões OneDrive');
      }

      setOneDriveConnections(data.connections || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar conexões OneDrive';
      toast.error(message);
    }
  };

  useEffect(() => {
    loadOneDriveConnections();
  }, []);

  const handleConnectOneDrive = async () => {
    setOneDriveLoading(true);

    try {
      const params = new URLSearchParams();
      if (oneDriveLoginHint.trim()) {
        params.set('loginHint', oneDriveLoginHint.trim());
      }

      const res = await fetch(`/api/onedrive/auth-url?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Erro ao iniciar autenticação OneDrive');
      }

      window.location.href = data.url;
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao iniciar autenticação OneDrive';
      toast.error(message);
      setOneDriveLoading(false);
    }
  };

  const handleValidateOneDrive = async (connectionId: string) => {
    setOneDriveLoading(true);

    try {
      const res = await fetch(`/api/onedrive/connections/${connectionId}/validate`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao validar conexão');
      }

      toast.success('Conexão OneDrive validada com sucesso');
      await loadOneDriveConnections();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao validar conexão';
      toast.error(message);
    } finally {
      setOneDriveLoading(false);
    }
  };

  const handleLoadOneDriveFiles = async (connectionId: string) => {
    setSelectedOneDriveConnectionId(connectionId);
    setOneDriveFilesLoading(true);
    setOneDriveItems([]);

    try {
      const res = await fetch(`/api/onedrive/connections/${connectionId}/files`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Falha ao listar arquivos');
      }

      setOneDriveItems(data.items || []);
      toast.success('Arquivos carregados');
      await loadOneDriveConnections();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao listar arquivos';
      toast.error(message);
    } finally {
      setOneDriveFilesLoading(false);
    }
  };

  const handleDisconnectOneDrive = async () => {
    const connectionId = pendingDisconnectId;
    if (!connectionId) return;

    setOneDriveLoading(true);

    try {
      const res = await fetch(`/api/onedrive/connections/${connectionId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao remover conexão');
      }

      if (selectedOneDriveConnectionId === connectionId) {
        setSelectedOneDriveConnectionId(null);
        setOneDriveItems([]);
      }

      toast.success('Conexão OneDrive removida');
      await loadOneDriveConnections();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao remover conexão';
      toast.error(message);
    } finally {
      setOneDriveLoading(false);
      setPendingDisconnectId(null);
    }
  };

  const nsdocsBadge = nsdocsConfig
    ? { label: 'Conectado', color: 'green' as const }
    : { label: 'Não configurado', color: 'yellow' as const };

  const receitaBadge = receitaConfig
    ? { label: 'Conectado', color: 'green' as const }
    : { label: 'Não configurado', color: 'yellow' as const };

  const oneDriveBadge = oneDriveConnections.length === 0
    ? { label: 'Não conectado', color: 'yellow' as const }
    : oneDriveConnections.some((connection) => connection.isExpired)
      ? { label: 'Revalidar', color: 'red' as const }
      : { label: `${oneDriveConnections.length} conta(s)`, color: 'green' as const };

  return (
    <>
      {/* Integração NSDocs */}
      <Section icon="hub" title="Integração NSDocs" defaultOpen badge={badgeDe(nsdocsBadge)}>
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-primary dark:text-blue-400 text-[20px] mt-0.5">info</span>
              <div>
                <h4 className="font-bold text-blue-900 dark:text-blue-300 text-xs">Como obter o Token da API</h4>
                <ol className="text-xs text-blue-800 dark:text-blue-400 mt-1 space-y-0.5 list-decimal list-inside">
                  <li>Acesse <a href="https://app.nsdocs.com.br" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-primary dark:hover:text-blue-400">app.nsdocs.com.br</a></li>
                  <li>Vá em <strong>Configurações → Integração via API</strong></li>
                  <li>Copie o <strong>Token de API</strong> gerado</li>
                  <li>Cole aqui abaixo e salve</li>
                </ol>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Token da API NSDocs
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                autoComplete="off"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                disabled={!canManageSettings}
                placeholder="Cole o token da API aqui..."
                className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 transition-all font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <Button
                onClick={handleTestConnection}
                disabled={nsdocsLoading || !apiToken || !canManageSettings}
                variant="ghost"
                icon="wifi_tethering"
              >
                Testar
              </Button>
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

          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/30 rounded-xl">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">Sincronização Automática</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Buscar documentos via NSDocs automaticamente (SEFAZ é manual)</p>
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

          {autoSync && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Intervalo de Sincronização
              </label>
              <select
                value={syncInterval}
                onChange={(e) => setSyncInterval(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white transition-all text-sm"
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

          {nsdocsConfig?.lastSyncAt && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="material-symbols-outlined text-[16px]">schedule</span>
              Última sincronização: {formatDateTimeSeconds(nsdocsConfig.lastSyncAt)}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={handleNsdocsSave} disabled={nsdocsLoading || !apiToken || !canManageSettings} icon="save">
              Salvar Configuração
            </Button>
          </div>
        </div>
      </Section>

      {/* Integração Receita NFS-e */}
      <Section icon="account_balance" title="Integração Receita NFS-e (ADN)" defaultOpen badge={badgeDe(receitaBadge)}>
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-orange-600 dark:text-orange-400 text-[20px] mt-0.5">info</span>
              <div>
                <h4 className="font-bold text-orange-900 dark:text-orange-300 text-xs">Observações da integração</h4>
                <p className="text-xs text-orange-800 dark:text-orange-400 mt-1">
                  A integração Receita NFS-e usa o certificado digital A1 da empresa. Se o ambiente exigir token adicional, informe abaixo.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Token da API Receita NFS-e (opcional)
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={receitaApiToken}
                onChange={(e) => setReceitaApiToken(e.target.value)}
                disabled={!canManageSettings}
                placeholder="Bearer token, se exigido no seu ambiente"
                className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 transition-all font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <Button
                onClick={handleReceitaTestConnection}
                disabled={receitaLoading || !canManageSettings}
                variant="ghost"
                icon="wifi_tethering"
              >
                Testar
              </Button>
            </div>

            {receitaTestResult && (
              <div className={`mt-2 p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
                receitaTestResult.ok
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
              }`}>
                <span className="material-symbols-outlined text-[18px]">
                  {receitaTestResult.ok ? 'check_circle' : 'error'}
                </span>
                {receitaTestResult.message}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Ambiente</label>
              <select
                value={receitaEnvironment}
                onChange={(e) => setReceitaEnvironment(e.target.value === 'production-restricted' ? 'production-restricted' : 'production')}
                disabled={!canManageSettings}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white transition-all text-sm disabled:opacity-50"
              >
                <option value="production">Produção</option>
                <option value="production-restricted">Produção Restrita</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">CNPJ de Consulta</label>
              <input
                value={receitaCnpjConsulta}
                onChange={(e) => setReceitaCnpjConsulta(e.target.value)}
                disabled={!canManageSettings}
                placeholder={company?.cnpj || 'Somente números'}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white transition-all text-sm disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Base URL personalizada (opcional)
            </label>
            <input
              value={receitaBaseUrl}
              onChange={(e) => setReceitaBaseUrl(e.target.value)}
              disabled={!canManageSettings}
              placeholder="Ex.: https://adn.nfse.gov.br/contribuintes"
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white transition-all text-sm font-mono disabled:opacity-50"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/30 rounded-xl">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">Sincronização Automática</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Buscar NFS-e recebidas automaticamente</p>
            </div>
            <button
              onClick={() => setReceitaAutoSync(!receitaAutoSync)}
              disabled={!canManageSettings}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                receitaAutoSync ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
              } disabled:opacity-50`}
              role="switch"
              aria-checked={receitaAutoSync}
              aria-label="Sincronização Automática Receita NFS-e"
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                receitaAutoSync ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {receitaAutoSync && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Intervalo de Sincronização</label>
              <select
                value={receitaSyncInterval}
                onChange={(e) => setReceitaSyncInterval(Number(e.target.value))}
                disabled={!canManageSettings}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white transition-all text-sm disabled:opacity-50"
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

          {receitaConfig && (
            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <p>Último NSU: <span className="font-mono">{receitaConfig.lastNsu}</span></p>
              {receitaConfig.lastSyncAt && (
                <p>Última sincronização: {formatDateTimeSeconds(receitaConfig.lastSyncAt)}</p>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleReceitaSave}
              disabled={receitaLoading || !canManageSettings}
              className="px-5 py-2.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-600 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-orange-600/30 hover:shadow-lg hover:shadow-orange-600/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              Salvar Configuração
            </button>
          </div>
        </div>
      </Section>

      {/* Integração OneDrive */}
      <Section icon="cloud_sync" title="Integração OneDrive" defaultOpen badge={badgeDe(oneDriveBadge)}>
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-xs text-blue-900 dark:text-blue-300 font-semibold">Conecte múltiplas contas Microsoft</p>
            <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
              Exemplo: conectar <strong>adm@qlmed.com.br</strong> e <strong>faturamento@qlmed.com.br</strong> para consultar e enviar arquivos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
            <input
              type="email"
              aria-label="email da conta Microsoft"
              value={oneDriveLoginHint}
              onChange={(e) => setOneDriveLoginHint(e.target.value)}
              placeholder="email da conta Microsoft"
              className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 transition-all text-sm"
            />
            <Button
              onClick={handleConnectOneDrive}
              disabled={!canManageSettings}
              loading={oneDriveLoading}
              icon="link"
            >
              Conectar Conta
            </Button>
          </div>

          {oneDriveConnections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400">
              Nenhuma conta OneDrive conectada ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {oneDriveConnections.map((connection) => (
                <div key={connection.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {connection.accountName || connection.accountEmail}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{connection.accountEmail}</p>
                    </div>
                    <Badge tone={connection.isExpired ? 'danger' : 'success'}>
                      {connection.isExpired ? 'Token expirado' : 'Conectado'}
                    </Badge>
                  </div>

                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                    <p>Última validação: {connection.lastValidatedAt ? formatDateTimeSeconds(connection.lastValidatedAt) : 'nunca'}</p>
                    <p>Expira em: {formatDateTimeSeconds(connection.tokenExpiresAt)}</p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleValidateOneDrive(connection.id)}
                      disabled={oneDriveLoading}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                    >
                      Validar conexão
                    </button>
                    <button
                      onClick={() => handleLoadOneDriveFiles(connection.id)}
                      disabled={oneDriveFilesLoading}
                      className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50"
                    >
                      Listar arquivos
                    </button>
                    {connection.driveWebUrl && (
                      <a
                        href={connection.driveWebUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                      >
                        Abrir OneDrive
                      </a>
                    )}
                    <button
                      onClick={() => setPendingDisconnectId(connection.id)}
                      disabled={oneDriveLoading}
                      className="px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                    >
                      Desconectar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedOneDriveConnectionId && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/30">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Arquivos da raiz</h4>
                {oneDriveFilesLoading && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">Carregando...</span>
                )}
              </div>

              {!oneDriveFilesLoading && oneDriveItems.length === 0 ? (
                <EmptyState icon="inbox" title="Nenhum item encontrado." compact />
              ) : (
                <div className="space-y-2">
                  {oneDriveItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{item.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.kind === 'folder' ? `Pasta (${item.childCount ?? 0} itens)` : `Arquivo (${formatBytes(item.size)})`}
                        </p>
                      </div>
                      {item.webUrl && (
                        <a
                          href={item.webUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-blue-700 dark:text-blue-300 hover:underline whitespace-nowrap"
                        >
                          Abrir
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Section>
      <ConfirmDialog
        isOpen={pendingDisconnectId !== null}
        onClose={() => setPendingDisconnectId(null)}
        onConfirm={handleDisconnectOneDrive}
        title="Remover conexão OneDrive"
        message="Deseja remover esta conexão OneDrive?"
        confirmLabel="Remover"
        confirmVariant="danger"
        loading={oneDriveLoading}
      />
    </>
  );
}
