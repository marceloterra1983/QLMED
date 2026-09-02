// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Section from '../Section';

afterEach(cleanup);

describe('Section (render)', () => {
  it('fechar e reabrir não desmonta o corpo — o estado de dentro sobrevive', () => {
    const { rerender } = render(
      <Section icon="x" title="Tabela" open onToggle={() => {}}>
        <input aria-label="busca" defaultValue="" />
      </Section>,
    );
    const campo = screen.getByLabelText('busca') as HTMLInputElement;
    campo.value = 'ncm 9018';
    rerender(
      <Section icon="x" title="Tabela" open={false} onToggle={() => {}}>
        <input aria-label="busca" defaultValue="" />
      </Section>,
    );
    // fechado: ainda no DOM, escondido, e é o MESMO nó (nada foi recriado)
    const fechado = document.querySelector<HTMLInputElement>('input[aria-label="busca"]')!;
    expect(fechado).toBe(campo);
    expect(fechado.closest('[hidden]')).not.toBeNull();
    expect(fechado.value).toBe('ncm 9018');
    rerender(
      <Section icon="x" title="Tabela" open onToggle={() => {}}>
        <input aria-label="busca" defaultValue="" />
      </Section>,
    );
    const reaberto = screen.getByLabelText('busca') as HTMLInputElement;
    expect(reaberto).toBe(campo);
    expect(reaberto.value).toBe('ncm 9018');
    expect(reaberto.closest('[hidden]')).toBeNull();
  });

  it('nunca aberto não monta o corpo', () => {
    render(
      <Section icon="x" title="T" open={false} onToggle={() => {}}>
        <input aria-label="busca" />
      </Section>,
    );
    expect(document.querySelector('input[aria-label="busca"]')).toBeNull();
  });

  it('o título do recolhível é um heading, e o botão vive dentro dele', () => {
    render(
      <Section icon="x" title="Certificado Digital" defaultOpen>
        <p>c</p>
      </Section>,
    );
    const h = screen.getByRole('heading', { name: /Certificado Digital/ });
    expect(h.tagName).toBe('H3');
    expect(h.querySelector('button')).not.toBeNull();
  });
});
