'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import CollapsibleCard from '@/components/ui/CollapsibleCard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

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

interface CertificateSectionProps {
  company: Company | null;
  canManageSettings: boolean;
}

export default function CertificateSection({ company, canManageSettings }: CertificateSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [certInfo, setCertInfo] = useState<CertificateInfo | null>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certMessage, setCertMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const certBadge = certInfo
    ? certInfo.isExpired
      ? { label: 'Expirado', color: 'red' as const }
      : { label: 'Válido', color: 'green' as const }
    : { label: 'Não instalado', color: 'yellow' as const };

  return (
    <>
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
                  disabled={!canManageSettings}
                  className="w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                  disabled={!canManageSettings}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="************"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={certLoading || !file || !certPassword || !canManageSettings}
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

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleCertDelete}
        title="Remover Certificado"
        message="Tem certeza que deseja remover o certificado? A sincronização direta com a SEFAZ deixará de funcionar."
        confirmLabel="Remover"
        confirmVariant="danger"
      />
    </>
  );
}
