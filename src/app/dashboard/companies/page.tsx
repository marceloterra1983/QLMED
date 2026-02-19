'use client';

import { useEffect, useState } from 'react';

interface Company {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  _count?: { invoices: number };
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [cnpj, setCnpj] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    try {
      const res = await fetch('/api/companies');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj, razaoSocial, nomeFantasia: nomeFantasia || undefined }),
      });

      if (res.ok) {
        setCnpj('');
        setRazaoSocial('');
        setNomeFantasia('');
        setShowForm(false);
        loadCompanies();
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao cadastrar empresa');
      }
    } catch {
      setError('Erro ao cadastrar empresa');
    } finally {
      setSaving(false);
    }
  };

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Empresas</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">
            Gerencie os CNPJs vinculados à sua conta.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-gradient-to-r from-primary to-primary-dark text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md shadow-primary/30 transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancelar' : 'Nova Empresa'}
        </button>
      </div>

      {/* Add Company Form */}
      {showForm && (
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Cadastrar Nova Empresa</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm font-medium">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">CNPJ *</label>
                <input
                  type="text"
                  value={cnpj}
                  onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                  placeholder="00.000.000/0001-00"
                  required
                  className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Razão Social *</label>
                <input
                  type="text"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  placeholder="Empresa Ltda"
                  required
                  className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nome Fantasia</label>
                <input
                  type="text"
                  value={nomeFantasia}
                  onChange={(e) => setNomeFantasia(e.target.value)}
                  placeholder="Opcional"
                  className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-bold shadow-md shadow-primary/30 disabled:opacity-50"
              >
                {saving ? (
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">save</span>
                )}
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Companies Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
          <p className="mt-2 text-sm">Carregando empresas...</p>
        </div>
      ) : companies.length === 0 ? (
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center shadow-sm">
          <span className="material-symbols-outlined text-[48px] text-slate-300 mb-4">business</span>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">Nenhuma empresa cadastrada</h3>
          <p className="text-sm text-slate-400 mt-2">Cadastre uma empresa para começar a importar notas fiscais.</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-md"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Cadastrar Empresa
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {companies.map((company) => (
            <div
              key={company.id}
              className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-xl text-primary mb-4 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-[24px]">business</span>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400">
                  {company._count?.invoices || 0} notas
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">{company.razaoSocial}</h3>
              {company.nomeFantasia && (
                <p className="text-xs text-slate-400 mb-2">{company.nomeFantasia}</p>
              )}
              <p className="text-xs text-slate-500 font-mono mt-2">
                CNPJ: {formatCnpj(company.cnpj)}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
