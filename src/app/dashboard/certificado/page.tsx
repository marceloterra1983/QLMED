'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface Company {
  id: string;
  cnpj: string;
  razaoSocial: string;
}

interface CertificateInfo {
  issuer: string;
  validTo: string;
  cnpjCertificate: string;
  environment: string;
  isExpired: boolean;
}

export default function CertificadoPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [certInfo, setCertInfo] = useState<CertificateInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carregar empresa única
  useEffect(() => {
    fetch('/api/companies')
      .then(res => res.json())
      .then(data => {
        setCompany(data.companies?.[0] || null);
      })
      .catch(() => toast.error('Erro ao carregar empresa'));
  }, []);

  // Carregar info do certificado
  useEffect(() => {
    loadCertInfo();
  }, []);

  const loadCertInfo = () => {
    setCertInfo(null);
    fetch('/api/certificate/info')
      .then(res => res.json())
      .then(data => {
        if (data.hasCertificate) {
          setCertInfo(data.certificate);
        }
      })
      .catch(() => toast.error('Erro ao carregar certificado'));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !password) return;

    setLoading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('password', password);

    try {
      const res = await fetch('/api/certificate/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: 'Certificado enviado e validado com sucesso!' });
        toast.success('Certificado enviado com sucesso!');
        setFile(null);
        setPassword('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        loadCertInfo();
      } else {
        setMessage({ type: 'error', text: data.error || 'Erro ao enviar certificado' });
        toast.error(data.error || 'Erro ao enviar certificado');
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro de conexão' });
      toast.error('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await fetch('/api/certificate/info', { method: 'DELETE' });
      setCertInfo(null);
      toast.success('Certificado removido com sucesso.');
    } catch {
      toast.error('Erro ao remover certificado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-primary">verified_user</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Certificado Digital</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">Certificado A1 para acesso à SEFAZ</p>
          </div>
        </div>
      </div>

      {/* Empresa fixa */}
      <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Empresa fixa</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {company ? `${company.razaoSocial} — ${company.cnpj}` : 'QL MED'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upload Form */}
        <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 p-6 h-fit">
          <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">upload_file</span>
            Upload de Novo Certificado
          </h3>
          
          <form onSubmit={handleUpload} className="space-y-4">
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                placeholder="************"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || !file || !password}
              className="w-full py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold transition-all shadow-md shadow-primary/30 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                  Enviando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
                  Instalar Certificado
                </>
              )}
            </button>
          </form>

          {message && (
            <div className={`mt-4 p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
              message.type === 'success' 
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
            }`}>
              <span className="material-symbols-outlined text-[18px]">
                {message.type === 'success' ? 'check_circle' : 'error'}
              </span>
              {message.text}
            </div>
          )}
        </div>

        {/* Certificate Status */}
        <div className="bg-white dark:bg-card-dark rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-500">info</span>
            Status do Certificado
          </h3>

          {!certInfo ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <span className="material-symbols-outlined text-[48px] mb-2 opacity-50">no_encryption</span>
              <p>Nenhum certificado instalado</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border ${
                certInfo.isExpired 
                  ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' 
                  : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`material-symbols-outlined ${
                    certInfo.isExpired ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {certInfo.isExpired ? 'error' : 'check_circle'}
                  </span>
                  <span className={`font-bold ${
                    certInfo.isExpired ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'
                  }`}>
                    {certInfo.isExpired ? 'Expirado' : 'Válido e Ativo'}
                  </span>
                </div>
                <p className="text-sm opacity-80 pl-8">
                  Válido até: {new Date(certInfo.validTo).toLocaleString('pt-BR')}
                </p>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <span className="block text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Emitido por</span>
                  <p className="text-slate-800 dark:text-slate-200 break-words">{certInfo.issuer}</p>
                </div>
                <div>
                  <span className="block text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">CNPJ no Certificado</span>
                  <p className="font-mono text-slate-800 dark:text-slate-200">{certInfo.cnpjCertificate || 'Não detectado'}</p>
                </div>
                <div>
                  <span className="block text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Ambiente</span>
                  <p className="text-slate-800 dark:text-slate-200 capitalize">{certInfo.environment === 'production' ? 'Produção' : 'Homologação'}</p>
                </div>
              </div>

              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full mt-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                Remover Certificado
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Remover Certificado"
        message="Tem certeza que deseja remover o certificado? A sincronização direta com a SEFAZ deixará de funcionar."
        confirmLabel="Remover"
        confirmVariant="danger"
      />
    </div>
  );
}
