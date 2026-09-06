import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Highlight from '../Highlight';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('Highlight', () => {
  it('renders raw text untouched when query is empty or undefined', () => {
    expect(html(<Highlight text="Hospital São Lucas" query="" />)).toBe('<span>Hospital São Lucas</span>');
    expect(html(<Highlight text="Hospital São Lucas" query={undefined} />)).toBe('<span>Hospital São Lucas</span>');
  });

  it('highlights matched word preserving original casing and accents', () => {
    const out = html(<Highlight text="Hospital São Lucas" query="sao" />);
    expect(out).toContain('<mark');
    expect(out).toContain('>São</mark>');
    expect(out).toContain('Hospital ');
    expect(out).toContain(' Lucas');
  });

  it('highlights unpadded digits for invoice numbers', () => {
    const out = html(<Highlight text="NF 000065053" query="65053" />);
    expect(out).toContain('<mark');
    expect(out).toContain('>65053</mark>');
  });

  it('highlights multi-word search queries', () => {
    const out = html(<Highlight text="Dra. Maria Cristina da Silva" query="Maria Silva" />);
    expect(out).toContain('>Maria</mark>');
    expect(out).toContain('>Silva</mark>');
  });

  it('returns null when text is null or empty', () => {
    expect(renderToStaticMarkup(<Highlight text={null} query="teste" />)).toBe('');
  });
});
