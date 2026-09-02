'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

type StatusResult = {
  online: boolean;
  cStat: string;
  xMotivo: string;
  tMed?: string;
};

export default function CertificateSefazPanel({
  environment,
  expired,
  canManage,
  busy,
  onEnvironmentSaved,
}: {
  environment: string;
  expired: boolean;
  canManage: boolean;
  busy: boolean;
  onEnvironmentSaved: (environment: 'homologation' | 'production') => void;
}) {
  const [pendingProduction, setPendingProduction] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusResult, setStatusResult] = useState<StatusResult | null>(null);
  const current = environment === 'homologation' ? 'homologation' : 'production';
  const locked = !canManage || busy || saving;

  const persistEnvironment = async (next: 'homologation' | 'production') => {
    setSaving(true);
    try {
      const res = await fetch('/api/certificate/info', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erro ao gravar ambiente');
        return;
      }
      setStatusResult(null);
      onEnvironmentSaved(next);
      toast.success(next === 'homologation'
        ? 'Ambiente gravado: homologação (sem valor fiscal).'
        : 'Ambiente gravado: produção SEFAZ.');
    } catch {
      toast.error('Erro ao gravar ambiente');
    } finally {
      setSaving(false);
    }
  };

  const handleEnvironmentChange = (next: 'homologation' | 'production') => {
    if (next === current) return;
    if (next === 'production') {
      setPendingProduction(true);
      return;
    }
    void persistEnvironment(next);
  };

  const handleStatusTest = async () => {
    setStatusLoading(true);
    setStatusResult(null);
    try {
      const res = await fetch('/api/certificate/status-servico', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Falha ao consultar a SEFAZ');
        return;
      }
      setStatusResult({
        online: Boolean(data.online),
        cStat: String(data.cStat || ''),
        xMotivo: String(data.xMotivo || ''),
        tMed: data.tMed ? String(data.tMed) : undefined,
      });
      if (data.online) toast.success('SEFAZ respondeu: serviço em operação.');
      else toast.error(data.xMotivo || 'SEFAZ respondeu com outro status.');
    } catch {
      toast.error('Erro de conexão ao testar a SEFAZ');
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <>
      <div>
        <span className="block text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Ambiente SEFAZ</span>
        <select
          aria-label="Ambiente SEFAZ"          value={current}
          disabled={locked}
          onChange={(e) => handleEnvironmentChange(e.target.value as 'homologation' | 'production')}
          className="mt-1 w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm disabled:opacity-50"
        >
          <option value="homologation">Homologação — sem valor fiscal</option>
          <option value="production">Produção — autoriza NF-e real</option>
        </select>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {current === 'homologation'
            ? 'Teste a conexão aqui antes de emitir. A sync DistDFe de documentos reais continua em produção.'
            : 'Produção autoriza nota com valor fiscal. Prefira homologação para o primeiro teste.'}
        </p>
      </div>

      <Button
        onClick={handleStatusTest}
        disabled={locked || expired}
        loading={statusLoading}
        variant="ghost"
        icon="wifi_tethering"
        block
      >
        {statusLoading ? 'Consultando SEFAZ...' : 'Testar conexão'}
      </Button>
      {statusResult && (
        <div className={`p-3 rounded-lg text-sm border ${
          statusResult.online
            ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800'
            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
        }`}>
          <p className="font-semibold">cStat {statusResult.cStat} — {statusResult.xMotivo}</p>
          {statusResult.tMed && <p className="text-xs mt-1">Tempo médio: {statusResult.tMed}s</p>}
          <p className="text-xs mt-1">Só consulta o status do serviço. Não emite nota.</p>
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingProduction}
        onClose={() => setPendingProduction(false)}
        onConfirm={() => {
          setPendingProduction(false);
          void persistEnvironment('production');
        }}
        title="Usar produção SEFAZ"
        message="Produção autoriza NF-e com valor fiscal. Homologação é o ambiente certo para testar a conexão."
        confirmLabel="Gravar produção"
        confirmVariant="danger"
      />
    </>
  );
}
