'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Field from '@/components/ui/Field';
import PageHeader from '@/components/PageHeader';

type AnvisaSourceKey = 'produtos_saude' | 'medicamentos';

interface SourceOption {
  key: AnvisaSourceKey;
  label: string;
  description: string;
  url: string;
}

interface EmbedStatus {
  canEmbed: boolean;
  reason?: string | null;
}

const SOURCE_OPTIONS: SourceOption[] = [
  {
    key: 'produtos_saude',
    label: 'Produtos para Saúde',
    description: 'Consulta pública de produtos para saúde regularizados',
    url: 'https://consultas.anvisa.gov.br/#/saude/',
  },
  {
    key: 'medicamentos',
    label: 'Medicamentos',
    description: 'Consulta pública de medicamentos regularizados',
    url: 'https://consultas.anvisa.gov.br/#/medicamentos/',
  },
];

export default function AnvisaPage() {
  const [source, setSource] = useState<AnvisaSourceKey>('produtos_saude');
  const [embedStatus, setEmbedStatus] = useState<EmbedStatus | null>(null);
  const [checkingEmbed, setCheckingEmbed] = useState(true);

  const selectedOption = useMemo(
    () => SOURCE_OPTIONS.find((option) => option.key === source) || SOURCE_OPTIONS[0],
    [source],
  );

  useEffect(() => {
    let cancelled = false;

    async function checkEmbedStatus() {
      setCheckingEmbed(true);
      try {
        const response = await fetch(`/api/anvisa/embed-status?source=${source}`, {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!cancelled) {
          setEmbedStatus({
            canEmbed: Boolean(data?.canEmbed),
            reason: data?.reason || null,
          });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setEmbedStatus({
            canEmbed: false,
            reason: error instanceof Error ? error.message : 'Falha ao validar o embed',
          });
        }
      } finally {
        if (!cancelled) setCheckingEmbed(false);
      }
    }

    checkEmbedStatus();
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <>
      <PageHeader
        icon="biotech"
        title="ANVISA"
        subtitle="Pesquisa pública na base oficial da ANVISA"
        showTitleOnMobile
        actions={(
          <Button href={selectedOption.url} external target="_blank" rel="noopener noreferrer" icon="open_in_new">
            Abrir no site da ANVISA
          </Button>
        )}
      />

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <Field label="Base de consulta" className="md:col-span-2">
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as AnvisaSourceKey)}
              className="block w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm transition-all"
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {selectedOption.description}
          </div>
        </div>
      </Card>

      <Card padding="none">
        {checkingEmbed ? (
          <div className="p-8 text-center">
            <span className="material-symbols-outlined text-[40px] text-slate-500 dark:text-slate-400">hourglass_top</span>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Verificando disponibilidade do embed da ANVISA...
            </p>
          </div>
        ) : embedStatus?.canEmbed ? (
          <>
            <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Se o embed falhar no seu navegador, use o botão “Abrir no site da ANVISA”.
              </p>
            </div>

            <iframe
              key={selectedOption.key}
              src={selectedOption.url}
              title={`Consulta ANVISA - ${selectedOption.label}`}
              className="w-full h-[calc(100vh-290px)] min-h-[640px] border-0"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </>
        ) : (
          <div className="p-8 md:p-10">
            <div className="max-w-3xl mx-auto text-center">
              <span className="material-symbols-outlined text-[44px] text-amber-500">warning</span>
              <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
                O site da ANVISA bloqueia incorporação por iframe
              </h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Para manter estabilidade, a consulta é aberta diretamente no portal oficial.
              </p>
              {embedStatus?.reason && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono break-all">
                  Detalhe técnico: {embedStatus.reason}
                </p>
              )}

              <div className="mt-5">
                <Button href={selectedOption.url} external target="_blank" rel="noopener noreferrer" icon="open_in_new">
                  Abrir consulta da ANVISA
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
