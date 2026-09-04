import { describe, expect, it } from 'vitest';
import {
  canAccessApi,
  canAccessPage,
  requiredPagesForApi,
  resolvePanelPagePath,
  VALID_PAGE_PATHS,
} from '../navigation';

/**
 * SPEC-042 FR-009 / AC-001 — Cadastro › Documentos entra no regime
 * default-deny: página e prefixo /api/documentos gated pela mesma entrada.
 */
describe('SPEC-042 — ACL de /cadastro/documentos', () => {
  it('a página é válida e o painel resolve para ela (inclusive subcaminhos)', () => {
    expect(VALID_PAGE_PATHS.has('/cadastro/documentos')).toBe(true);
    expect(resolvePanelPagePath('/cadastro/documentos')).toBe('/cadastro/documentos');
    expect(resolvePanelPagePath('/cadastro/documentos/abc')).toBe('/cadastro/documentos');
  });

  it('/api/documentos e subrotas exigem exatamente a página Documentos', () => {
    expect(requiredPagesForApi('/api/documentos')).toEqual(['/cadastro/documentos']);
    expect(requiredPagesForApi('/api/documentos/sync')).toEqual(['/cadastro/documentos']);
    expect(requiredPagesForApi('/api/documentos/abc/arquivo')).toEqual(['/cadastro/documentos']);
  });

  it('nega sem a página, permite com a página, admin isento', () => {
    expect(canAccessPage('viewer', [], '/cadastro/documentos')).toBe(false);
    expect(canAccessPage('editor', ['/cadastro/produtos'], '/cadastro/documentos')).toBe(false);
    expect(canAccessApi('viewer', ['/cadastro/produtos'], '/api/documentos')).toBe(false);

    expect(canAccessPage('viewer', ['/cadastro/documentos'], '/cadastro/documentos')).toBe(true);
    expect(canAccessApi('viewer', ['/cadastro/documentos'], '/api/documentos/x/arquivo')).toBe(true);

    expect(canAccessPage('admin', [], '/cadastro/documentos')).toBe(true);
    expect(canAccessApi('admin', [], '/api/documentos/sync')).toBe(true);
  });

  it('a página Documentos não abre outros prefixos de Cadastros', () => {
    expect(canAccessApi('viewer', ['/cadastro/documentos'], '/api/products')).toBe(false);
    expect(canAccessApi('viewer', ['/cadastro/documentos'], '/api/contacts')).toBe(false);
    // prefixo parecido não casa: /api/documentosx não é /api/documentos/...
    expect(requiredPagesForApi('/api/documentosx')).toEqual([]);
  });
});
