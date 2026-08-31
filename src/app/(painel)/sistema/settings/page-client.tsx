'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { useRole } from '@/hooks/useRole';
import CertificateSection from './components/CertificateSection';
import IntegrationsSection from './components/IntegrationsSection';
import PreferencesSection from './components/PreferencesSection';
import { PushDeviceToggle } from '@/components/PushDeviceToggle';
import PageHeader from '@/components/PageHeader';

interface Company {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
}

export default function SettingsPage() {
  const { status } = useSession();
  const { canManageSettings } = useRole();
  const [mounted, setMounted] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetch('/api/companies')
      .then(res => res.json())
      .then(data => setCompany(data.companies?.[0] || null))
      .catch(() => toast.error('Erro ao carregar empresa'));
  }, []);

  if (!mounted || status === 'loading') {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!canManageSettings && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-700 dark:text-amber-400 text-sm font-medium">
          <span className="material-symbols-outlined text-[18px]">lock</span>
          Modo somente leitura — você não tem permissão para alterar configurações.
        </div>
      )}

      <PageHeader
        icon="settings"
        title="Configurações"
        subtitle="Preferências e integrações do sistema"
      />

      <CertificateSection company={company} canManageSettings={canManageSettings} />
      <IntegrationsSection company={company} canManageSettings={canManageSettings} />
      <PreferencesSection />
      <PushDeviceToggle />
    </div>
  );
}
