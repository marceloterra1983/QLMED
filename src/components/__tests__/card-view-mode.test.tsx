import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import CardViewModeToggle from '@/components/ui/CardViewModeToggle';
import Section from '@/components/ui/Section';
import ContactDetailsModal from '@/components/ContactDetailsModal';
import ProductDetailModal from '@/app/(painel)/cadastro/produtos/components/ProductDetailModal';
import HistoryModal from '@/app/(painel)/cadastro/produtos/components/HistoryModal';
import type { ProductRow } from '@/app/(painel)/cadastro/produtos/types';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 'admin' } }, status: 'authenticated' }),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ role: 'admin', canWrite: true, isMaster: true }),
}));

vi.mock('@/hooks/useModalBackButton', () => ({
  useModalBackButton: () => {},
}));

describe('CardViewModeToggle', () => {
  it('renderiza com role group e opções de popup e expandir', () => {
    const out = renderToStaticMarkup(<CardViewModeToggle mode="popup" onChange={() => {}} />);
    expect(out).toContain('role="group"');
    expect(out).toContain('aria-label="Modo de visualização dos cards"');
    expect(out).toContain('Abrir em popup');
    expect(out).toContain('Expandir no modal');
    expect(out).toContain('aria-pressed="true"');
    expect(out).toContain('open_in_new');
    expect(out).toContain('unfold_more');
  });

  it('quando mode="expand", marca o botão de expandir como ativo', () => {
    const out = renderToStaticMarkup(<CardViewModeToggle mode="expand" onChange={() => {}} />);
    const match = out.match(/aria-pressed="true"[^>]*>[\s\S]*?Expandir no modal/);
    expect(match).toBeTruthy();
  });
});

describe('Section com viewMode', () => {
  it('em viewMode="popup", exibe ícone open_in_new e não expande o corpo inline', () => {
    const out = renderToStaticMarkup(
      <Section icon="analytics" title="Dados Gerais" viewMode="popup">
        <p>conteudo-interno-secao</p>
      </Section>
    );
    expect(out).toContain('open_in_new');
    expect(out).not.toContain('expand_more');
    expect(out).not.toContain('conteudo-interno-secao');
  });

  it('em viewMode="expand" fechado, exibe ícone expand_more e não exibe o corpo', () => {
    const out = renderToStaticMarkup(
      <Section icon="analytics" title="Dados Gerais" open={false} onToggle={() => {}} viewMode="expand">
        <p>conteudo-interno-secao</p>
      </Section>
    );
    expect(out).toContain('expand_more');
    expect(out).not.toContain('open_in_new');
    expect(out).not.toContain('conteudo-interno-secao');
  });

  it('em viewMode="expand" aberto, exibe o corpo', () => {
    const out = renderToStaticMarkup(
      <Section icon="analytics" title="Dados Gerais" open={true} onToggle={() => {}} viewMode="expand">
        <p>conteudo-interno-secao</p>
      </Section>
    );
    expect(out).toContain('conteudo-interno-secao');
    expect(out).toContain('aria-expanded="true"');
  });
});

describe('ContactDetailsModal: recolhimento e alternador de modo', () => {
  it('renderiza o CardViewModeToggle no cabeçalho', () => {
    const out = renderToStaticMarkup(
      <ContactDetailsModal kind="customer" isOpen onClose={() => {}} contact={{ cnpj: '12345678000199', name: 'Cliente Teste' }} />
    );
    expect(out).toContain('Modo de visualização dos cards');
    expect(out).toContain('Abrir em popup');
    expect(out).toContain('Expandir no modal');
  });

  it('inicia com todos os cards recolhidos (isGeneralOpen false por padrão no código)', () => {
    const fs = require('fs');
    const src = fs.readFileSync('src/components/ContactDetailsModal.tsx', 'utf8');
    expect(src).toContain('setIsGeneralOpen(false)');
    expect(src).not.toContain('setIsGeneralOpen(true)');
  });
});

describe('ProductDetailModal: recolhimento e alternador de modo', () => {
  const dummyProduct: ProductRow = {
    key: 'prod-1',
    code: 'COD-123',
    codigo: 'INT-01',
    description: 'Produto Teste',
    shortName: 'Prod Teste',
    productType: 'Linha A',
    productSubtype: 'Grupo B',
    productSubgroup: 'Sub C',
    manufacturerShortName: 'Fab',
    anvisa: '12345678901',
    anvisaExpiration: '2028-12-31',
    anvisaStatus: 'Válido',
    lastPrice: 150.0,
    lastIssueDate: '2026-08-01',
    lastSaleDate: null,
    lastSalePrice: null,
    totalQuantity: 10,
    invoiceCount: 2,
    outOfLine: false,
    instrumental: false,
    ncm: '12345678',
    unit: 'UN',
  };

  const dummyHier = {
    types: ['Linha A'],
    subtypes: ['Grupo B'],
    subgroups: ['Sub C'],
    lines: ['Linha A'],
    allGroups: ['Grupo B'],
    allSubgroups: ['Sub C'],
    groupsByLine: [{ line: 'Linha A', groups: ['Grupo B'] }],
    orphanGroups: [],
    subgroupsByGroup: [{ group: 'Grupo B', subgroups: ['Sub C'] }],
    orphanSubgroups: [],
    subtypesByType: { 'Linha A': ['Grupo B'] },
    subgroupsBySubtype: { 'Grupo B': ['Sub C'] },
    groupsFor: () => ['Grupo B'],
    subgroupsFor: () => ['Sub C'],
    subgroupsForGroup: () => ['Sub C'],
  };

  const dummySettings = {
    nomeTributacaoOptions: [],
    obsIcmsOptions: [],
    obsPisCofinsOptions: [],
    manufacturerOptions: [],
    ncmOptions: [],
    cestOptions: [],
    aliqIcmsOptions: [],
    aliqPisOptions: [],
    aliqCofinsOptions: [],
    aliqIpiOptions: [],
    aliqFcpOptions: [],
  };

  it('renderiza o CardViewModeToggle e inicia com cards recolhidos', () => {
    const out = renderToStaticMarkup(
      <ProductDetailModal
        product={dummyProduct}
        onClose={() => {}}
        onUpdated={() => {}}
        onOpenHistory={() => {}}
        hierOptions={dummyHier}
        settingsOptions={dummySettings}
      />
    );
    expect(out).toContain('Modo de visualização dos cards');
    expect(out).toContain('Abrir em popup');
    expect(out).toContain('Expandir no modal');
    // Inicia em modo popup por padrão: ícone open_in_new presente nas seções
    expect(out).toContain('open_in_new');
  });

  it('empilha cabeçalho no mobile sem esmagar o título ao lado do toggle', () => {
    const out = renderToStaticMarkup(
      <ProductDetailModal
        product={dummyProduct}
        onClose={() => {}}
        onUpdated={() => {}}
        onOpenHistory={() => {}}
        hierOptions={dummyHier}
        settingsOptions={dummySettings}
      />
    );
    expect(out).toContain('flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3');
    expect(out).toContain('w-full sm:w-auto');
    expect(out).toContain('INT-01');
    expect(out).toContain('COD-123');
    expect(out).toContain('Produto Teste');
  });

  it('não força abertura de geral por padrão no código', () => {
    const fs = require('fs');
    const src = fs.readFileSync('src/app/(painel)/cadastro/produtos/components/ProductDetailModal.tsx', 'utf8');
    expect(src).not.toContain("nextOpenSections.add('geral')");
  });
});

describe('HistoryModal: recolhimento e alternador de modo', () => {
  it('renderiza o CardViewModeToggle e inicia com cards recolhidos', () => {
    const dummyProduct: ProductRow = {
      key: 'prod-1',
      code: 'COD-123',
      description: 'Produto Teste',
      lastPrice: 150,
      totalQuantity: 10,
      invoiceCount: 2,
      unit: 'UN',
      ncm: null,
      anvisa: null,
      lastIssueDate: null,
      lastSaleDate: null,
      lastSalePrice: null,
    };

    const out = renderToStaticMarkup(
      <HistoryModal
        product={dummyProduct}
        onClose={() => {}}
        onOpenInvoice={() => {}}
      />
    );
    expect(out).toContain('Modo de visualização dos cards');
    expect(out).toContain('Abrir em popup');
    expect(out).toContain('Expandir no modal');
    expect(out).toContain('open_in_new');
    expect(out).toContain('flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3');
  });
});
