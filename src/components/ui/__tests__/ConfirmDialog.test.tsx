import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDialog from '../ConfirmDialog';

// next/link puxa o runtime do router; aqui só interessa o <a> que ele emite.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/**
 * Foco preso, `Esc` e trava de rolagem vivem no `<Modal>` (provados em
 * `Modal.test.tsx` e `lib/__tests__/focus-trap.test.ts`); aqui verifica-se
 * que o ConfirmDialog está fiado por cima dele e o que ele próprio emite.
 */
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const aberto = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => (
  <ConfirmDialog
    isOpen
    onClose={() => {}}
    onConfirm={() => {}}
    title="Excluir documentos"
    message="Esta ação não pode ser desfeita."
    {...props}
  />
);

const shell = (out: string) => out.match(/<div[^>]*role="dialog"[^>]*>/)?.[0] ?? '';

/**
 * Só a tag de abertura do <button> cujo rótulo é `label`. `toContain('disabled')`
 * sobre o botão inteiro casaria com a classe `disabled:opacity-45`.
 */
const botao = (out: string, label: string) =>
  [...out.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find((m) => m[2].includes(label))?.[1] ??
  '';
const temAtributo = (attrs: string, nome: string) => new RegExp(`\\s${nome}(=|\\s|$)`).test(attrs);

describe('ConfirmDialog', () => {
  it('fechado não renderiza nada', () => {
    expect(html(aberto({ isOpen: false }))).toBe('');
  });

  it('é um dialog do Modal, nomeado pelo título', () => {
    const out = html(aberto());
    const tag = shell(out);
    expect(tag).toContain('aria-modal="true"');
    const id = tag.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(out).toMatch(new RegExp(`<h2\\b[^>]*id="${id}"[^>]*>Excluir documentos</h2>`));
    expect(tag).toContain('sm:max-w-md');
  });

  it('mostra a mensagem', () => {
    expect(html(aberto())).toContain('Esta ação não pode ser desfeita.');
  });

  it('rótulos padrão são Confirmar/Cancelar e os passados substituem', () => {
    const padrao = html(aberto());
    expect(botao(padrao, 'Confirmar')).not.toBe('');
    expect(botao(padrao, 'Cancelar')).not.toBe('');

    const proprio = html(aberto({ confirmLabel: 'Excluir', cancelLabel: 'Manter' }));
    expect(botao(proprio, 'Excluir')).not.toBe('');
    expect(botao(proprio, 'Manter')).not.toBe('');
    expect(proprio).not.toContain('Confirmar');
  });

  it('danger pinta o botão de vermelho e mostra o ícone warning; primary usa help', () => {
    const danger = html(aberto({ confirmVariant: 'danger' }));
    expect(botao(danger, 'Confirmar')).toContain('bg-red-600');
    expect(danger).toContain('>warning<');
    expect(danger).not.toContain('>help<');

    const primary = html(aberto());
    expect(botao(primary, 'Confirmar')).toContain('bg-primary');
    expect(botao(primary, 'Confirmar')).not.toContain('bg-red-600');
    expect(primary).toContain('>help<');
    expect(primary).not.toContain('>warning<');
  });

  it('loading desabilita só o botão de confirmar', () => {
    const out = html(aberto({ loading: true }));
    expect(temAtributo(botao(out, 'Confirmar'), 'disabled')).toBe(true);
    expect(temAtributo(botao(out, 'Cancelar'), 'disabled')).toBe(false);
    expect(temAtributo(botao(html(aberto()), 'Confirmar'), 'disabled')).toBe(false);
  });

  it('não tem teclado, foco nem rolagem próprios — tudo vem do Modal', () => {
    const out = html(aberto());
    // O rodapé "Voltar" do Modal foi removido (footer={null}); os dois botões bastam.
    expect(out).not.toContain('Voltar');
    expect(out).not.toContain('focus:ring');
  });
});
