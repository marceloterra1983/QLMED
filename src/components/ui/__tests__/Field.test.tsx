import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Field, { FIELD_CONTROL_CLS } from '../Field';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

/** Extrai o par (for do label, id do controle) para provar que se amarram. */
function amarracao(out: string) {
  const label = out.match(/<label[^>]*for="([^"]+)"/);
  const control = out.match(/<(?:input|select|textarea)[^>]*id="([^"]+)"/);
  return { forAttr: label?.[1], idAttr: control?.[1] };
}

describe('Field', () => {
  it('amarra o rótulo ao controle — clicar no rótulo foca o campo', () => {
    const out = html(
      <Field label="Série">
        <input className={FIELD_CONTROL_CLS} />
      </Field>,
    );
    const { forAttr, idAttr } = amarracao(out);
    expect(forAttr).toBeTruthy();
    expect(idAttr).toBe(forAttr);
  });

  it('dois campos na mesma página não colidem de id', () => {
    const out = html(
      <>
        <Field label="Data início">
          <input />
        </Field>
        <Field label="Data fim">
          <input />
        </Field>
      </>,
    );
    const ids = [...out.matchAll(/<input[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('um id que o chamador já definiu tem precedência', () => {
    const out = html(
      <Field label="CNPJ">
        <input id="cnpj-destinatario" />
      </Field>,
    );
    expect(out).toContain('id="cnpj-destinatario"');
  });

  it('a dica é anunciada por aria-describedby', () => {
    const out = html(
      <Field label="CNPJ" hint="Aceita com ou sem pontuação.">
        <input />
      </Field>,
    );
    const desc = out.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(desc).toBeTruthy();
    expect(out).toContain(`id="${desc}"`);
    expect(out).toContain('Aceita com ou sem pontuação.');
  });

  it('o erro marca aria-invalid e substitui a dica', () => {
    const out = html(
      <Field label="Série" hint="Entre 1 e 999." error="A série precisa ser maior que zero.">
        <input />
      </Field>,
    );
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('A série precisa ser maior que zero.');
    expect(out).not.toContain('Entre 1 e 999.');
  });

  it('required marca o controle e mostra o asterisco', () => {
    const out = html(
      <Field label="Destinatário" required>
        <input />
      </Field>,
    );
    expect(out).toContain('aria-required="true"');
    expect(out).toContain('*');
  });

  it('o rótulo respeita o piso de 12px e o par de tema', () => {
    const out = html(
      <Field label="Tipo de NF-e">
        <select />
      </Field>,
    );
    expect(out).toMatch(/class="[^"]*text-xs[^"]*"/);
    expect(out).toContain('text-slate-500');
    expect(out).toContain('dark:text-slate-400');
  });

  it('sem dica nem erro não sobra aria-describedby vazio', () => {
    const out = html(
      <Field label="Série">
        <input />
      </Field>,
    );
    expect(out).not.toContain('aria-describedby');
  });
});
