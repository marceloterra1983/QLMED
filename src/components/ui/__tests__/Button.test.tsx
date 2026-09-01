import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Button from '../Button';

// next/link puxa o runtime do router; aqui só interessa o <a> que ele emite.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

/**
 * Só a tag de abertura. `toContain('disabled')` casaria com a classe
 * `disabled:opacity-45` e daria falso positivo — um controle deste teste
 * passou com o defeito injetado antes desta função existir.
 */
const tag = (el: React.ReactElement) => renderToStaticMarkup(el).match(/^<[^>]+>/)?.[0] ?? '';
const temAtributo = (el: React.ReactElement, nome: string) =>
  new RegExp(`\\s${nome}(=|\\s|>)`).test(tag(el));

describe('Button', () => {
  it('renderiza um <button type="button"> por padrão', () => {
    const out = html(<Button>Salvar</Button>);
    expect(out).toContain('<button');
    expect(out).toContain('type="button"');
    expect(out).toContain('Salvar');
  });

  it('respeita type="submit" quando o formulário pede', () => {
    expect(html(<Button type="submit">Enviar</Button>)).toContain('type="submit"');
  });

  it('cada variante tem seu próprio fundo e nenhuma usa text-primary', () => {
    const fundos = {
      primary: 'bg-primary',
      soft: 'bg-primary/10',
      secondary: 'bg-white',
      ghost: 'text-slate-600',
      danger: 'bg-red-600',
    } as const;
    for (const [variant, marca] of Object.entries(fundos)) {
      const out = html(<Button variant={variant as keyof typeof fundos}>x</Button>);
      expect(out, variant).toContain(marca);
      // 2,91:1 sobre card-dark — proibido como cor de texto
      expect(out, variant).not.toMatch(/class="[^"]*\btext-primary(?!-)/);
    }
  });

  it('os três tamanhos são 32, 40 e 44px, e lg é o piso de toque', () => {
    expect(html(<Button size="sm">x</Button>)).toContain('h-8');
    expect(html(<Button size="md">x</Button>)).toContain('h-10');
    expect(html(<Button size="lg">x</Button>)).toContain('h-11');
  });

  it('o ícone é decorativo e não é lido duas vezes', () => {
    const out = html(<Button icon="post_add">Nova NF-e</Button>);
    expect(out).toContain('material-symbols-outlined');
    expect(out).toContain('post_add');
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('Nova NF-e');
  });

  it('loading troca o ícone, gira, desabilita e anuncia aria-busy', () => {
    const out = html(
      <Button icon="download" loading>
        Exportar
      </Button>,
    );
    expect(out).toContain('progress_activity');
    expect(out).not.toContain('download');
    expect(out).toContain('animate-spin');
    expect(out).toContain('aria-busy="true"');
    expect(
      temAtributo(
        <Button icon="download" loading>
          Exportar
        </Button>,
        'disabled',
      ),
    ).toBe(true);
  });

  it('disabled do chamador sobrevive, e um botão são não vem desabilitado', () => {
    expect(temAtributo(<Button disabled>x</Button>, 'disabled')).toBe(true);
    expect(temAtributo(<Button>x</Button>, 'disabled')).toBe(false);
  });

  it('href vira âncora e preserva o destino', () => {
    const out = html(
      <Button href="/fiscal/issued/nova" icon="post_add">
        Nova NF-e
      </Button>,
    );
    expect(out).toContain('<a');
    expect(out).toContain('href="/fiscal/issued/nova"');
    expect(out).not.toContain('<button');
  });

  it('block ocupa a largura toda', () => {
    expect(html(<Button block>x</Button>)).toContain('w-full');
    expect(html(<Button>x</Button>)).not.toContain('w-full');
  });

  it('passa title e aria-label adiante', () => {
    const out = html(
      <Button title="Ocultar valores" aria-label="Ocultar valores" icon="visibility_off" />,
    );
    expect(out).toContain('title="Ocultar valores"');
    expect(out).toContain('aria-label="Ocultar valores"');
  });

  it('external emite âncora simples, sem roteamento do cliente', () => {
    const out = html(
      <Button href="https://exemplo.org" external target="_blank" rel="noopener noreferrer">
        ANVISA
      </Button>,
    );
    expect(out).toContain('<a href="https://exemplo.org"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('o primário suave usa primary-dark, que passa a AA sobre o fundo tingido', () => {
    const out = html(<Button variant="soft">Tentar novamente</Button>);
    expect(out).toContain('text-primary-dark');
    expect(out).toContain('dark:text-blue-400');
  });

  it('não sobrepõe o contorno de foco global com focus:ring', () => {
    expect(html(<Button>x</Button>)).not.toContain('focus:ring');
  });
});
