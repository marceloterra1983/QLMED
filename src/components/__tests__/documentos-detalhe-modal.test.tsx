// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentoDetalheModal from '@/app/(painel)/cadastro/documentos/components/DocumentoDetalheModal';
import { CERTIDAO_EMISSAO_URL, CERTIDAO_LABEL } from '@/lib/documentos/constants';
import type { DocumentosRow } from '@/lib/documentos/list';

vi.mock('@/hooks/useModalBackButton', () => ({
  useModalBackButton: () => {},
}));

function certidaoRow(overrides: Partial<DocumentosRow> = {}): DocumentosRow {
  return {
    id: 'doc-federal',
    kind: 'cnd_federal',
    category: 'certidao',
    label: CERTIDAO_LABEL.cnd_federal,
    fileName: 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf',
    manufacturer: null,
    validUntil: '2026-12-12',
    emitidoEm: '2026-09-13',
    daysRemaining: 99,
    status: { key: 'ok', label: 'ok' },
    validUntilSource: 'filename',
    expira: true,
    emissaoUrl: CERTIDAO_EMISSAO_URL.cnd_federal,
    emissaoAria: 'Emitir CND Receita Federal no site da Receita',
    webUrl: null,
    automacao: 'manual',
    ...overrides,
  };
}

function afeRow(overrides: Partial<DocumentosRow> = {}): DocumentosRow {
  return {
    id: 'doc-afe',
    kind: 'afe_anvisa',
    category: 'sanitaria',
    label: 'AFE — Autorização de Funcionamento ANVISA',
    fileName: 'AFE - EMITIDO EM 06.01.2026.pdf',
    manufacturer: null,
    validUntil: null,
    emitidoEm: null,
    daysRemaining: null,
    status: { key: 'nao_vence', label: 'não vence' },
    validUntilSource: null,
    expira: false,
    emissaoUrl: 'https://consultas.anvisa.gov.br/#/empresas/empresas/',
    emissaoAria: 'Consultar AFE no cadastro da ANVISA',
    webUrl: null,
    automacao: null,
    ...overrides,
  };
}

function cartaRow(overrides: Partial<DocumentosRow> = {}): DocumentosRow {
  return {
    id: 'doc-carta',
    kind: 'carta_comercializacao',
    category: 'carta',
    label: 'CARDIOVENT',
    fileName: 'CARTA CARDIOVENT.pdf',
    manufacturer: 'CARDIOVENT',
    validUntil: '2026-08-26',
    emitidoEm: '2026-02-26',
    daysRemaining: 10,
    status: { key: 'ok', label: 'ok' },
    validUntilSource: 'pdf',
    expira: true,
    emissaoUrl: null,
    emissaoAria: null,
    webUrl: null,
    automacao: null,
    ...overrides,
  };
}

const modalHandlers = {
  onClose: vi.fn(),
  onView: vi.fn(),
  onShare: vi.fn(),
  onWhatsApp: vi.fn(),
  onUpdate: vi.fn(),
  onPatch: vi.fn(async () => null),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DocumentoDetalheModal (SPEC-042 L13)', () => {
  it('mostra tipo, arquivo, emitido, vencimento, dias, descrição e quem emite', () => {
    render(
      <DocumentoDetalheModal
        isOpen
        row={certidaoRow()}
        canWrite
        {...modalHandlers}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Gestão: CND Receita Federal' });
    expect(dialog.textContent).toContain('CND Receita Federal');
    expect(dialog.textContent).toContain('CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf');
    expect(screen.getByText('13/09/2026')).toBeTruthy();
    expect(screen.getByText('12/12/2026')).toBeTruthy();
    expect(screen.getByText('99 dias')).toBeTruthy();
    expect(dialog.textContent).toMatch(/Prova que a empresa não tem dívidas com a Receita Federal/);
    expect(screen.getByText('Receita Federal do Brasil')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Emitir CND Receita Federal/ }).getAttribute('href')).toBe(
      CERTIDAO_EMISSAO_URL.cnd_federal,
    );
  });

  it('emitidoEm null mostra não informado e ignora lastModifiedAt', () => {
    const row = {
      ...certidaoRow({ emitidoEm: null }),
      lastModifiedAt: '2026-01-15',
    };
    render(
      <DocumentoDetalheModal
        isOpen
        row={row}
        canWrite
        {...modalHandlers}
      />,
    );
    expect(screen.getByText('não informado')).toBeTruthy();
    expect(screen.queryByText('15/01/2026')).toBeNull();
  });

  it('quem emite aparece mesmo quando o documento não vence', () => {
    render(
      <DocumentoDetalheModal
        isOpen
        row={afeRow()}
        canWrite
        {...modalHandlers}
      />,
    );
    expect(screen.getAllByText('não vence').length).toBeGreaterThan(0);
    const bloco = screen.getByText('Quem emite / onde renovar').closest('[data-bloco="quem-emite"]')!;
    expect(bloco.textContent).toContain('ANVISA');
    expect(
      screen.getByRole('link', { name: 'Consultar AFE no cadastro da ANVISA' }).getAttribute('href'),
    ).toMatch(/consultas\.anvisa\.gov\.br/);
    expect(screen.queryByRole('button', { name: 'Atualizar arquivo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar validade' })).toBeNull();
  });

  it('dias restantes <= 7 recebem o mesmo destaque da tabela', () => {
    render(
      <DocumentoDetalheModal
        isOpen
        row={certidaoRow({ daysRemaining: 3, validUntil: '2026-09-08' })}
        canWrite
        {...modalHandlers}
      />,
    );
    expect(screen.getByText('3 dias').getAttribute('data-destaque')).toBe('true');
  });

  it('Atualizar arquivo chama onUpdate; Ver chama onView', () => {
    const onUpdate = vi.fn();
    const onView = vi.fn();
    const row = certidaoRow();
    render(
      <DocumentoDetalheModal
        isOpen
        onClose={vi.fn()}
        row={row}
        canWrite
        onView={onView}
        onShare={vi.fn()}
        onWhatsApp={vi.fn()}
        onUpdate={onUpdate}
        onPatch={vi.fn(async () => null)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar arquivo' }));
    expect(onUpdate).toHaveBeenCalledWith(row);
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect(onView).toHaveBeenCalledWith(row);
  });

  it('tem botão WhatsApp distinto de Compartilhar', () => {
    const onWhatsApp = vi.fn();
    const onShare = vi.fn();
    const row = certidaoRow();
    render(
      <DocumentoDetalheModal
        isOpen
        onClose={vi.fn()}
        row={row}
        canWrite
        onView={vi.fn()}
        onShare={onShare}
        onWhatsApp={onWhatsApp}
        onUpdate={vi.fn()}
        onPatch={vi.fn(async () => null)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'WhatsApp' }));
    expect(onWhatsApp).toHaveBeenCalledWith(row);
    expect(onShare).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeTruthy();
  });

  it('lápis discreto no popup edita validade via onPatch', async () => {
    const onPatch = vi.fn(async (_row, patch) => ({
      ...certidaoRow(),
      ...patch,
    }));
    render(
      <DocumentoDetalheModal
        isOpen
        row={certidaoRow()}
        canWrite
        {...modalHandlers}
        onPatch={onPatch}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar validade' }));
    fireEvent.change(screen.getByLabelText('Validade'), { target: { value: '2027-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'doc-federal' }),
        { validUntil: '2027-01-15' },
      );
    });
  });

  it('carta: fabricante e assinatura editáveis no popup', async () => {
    const onPatch = vi.fn(async (row, patch) => ({ ...row, ...patch }));
    render(
      <DocumentoDetalheModal
        isOpen
        row={cartaRow()}
        canWrite
        {...modalHandlers}
        onPatch={onPatch}
      />,
    );
    expect(screen.getByText('CARDIOVENT')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Editar fabricante' }));
    fireEvent.change(screen.getByLabelText('Fabricante'), { target: { value: 'NOVO FAB' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'doc-carta' }),
        { manufacturer: 'NOVO FAB' },
      );
    });
  });
});
