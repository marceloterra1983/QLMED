import { describe, expect, it } from 'vitest';
import {
  canAccessApi,
  canAccessPage,
  PAGE_GROUPS,
  requiredPagesForApi,
  resolvePanelPagePath,
  VALID_PAGE_PATHS,
} from '../navigation';
import { config as middlewareConfig } from '@/middleware';

describe('SPEC-085 — ACL de /orcamentos', () => {
  it('a página é válida e o painel resolve para ela', () => {
    expect(VALID_PAGE_PATHS.has('/orcamentos')).toBe(true);
    expect(resolvePanelPagePath('/orcamentos')).toBe('/orcamentos');
    expect(resolvePanelPagePath('/orcamentos/novo')).toBe('/orcamentos');
    expect(resolvePanelPagePath('/orcamentos/abc')).toBe('/orcamentos');
    expect(PAGE_GROUPS[0]?.section).toBe('Comercial');
    expect(PAGE_GROUPS[0]?.pages.map((p) => p.path)).toEqual(['/orcamentos']);
  });

  it('/api/orcamentos exige exatamente a página Orçamentos', () => {
    expect(requiredPagesForApi('/api/orcamentos')).toEqual(['/orcamentos']);
    expect(requiredPagesForApi('/api/orcamentos/x/pdf')).toEqual(['/orcamentos']);
    expect(requiredPagesForApi('/api/orcamentos/arquivo/import')).toEqual(['/orcamentos']);
    expect(requiredPagesForApi('/api/orcamentos/arquivo/x/pdf')).toEqual(['/orcamentos']);
    expect(requiredPagesForApi('/api/orcamentos/clientes')).toEqual(['/orcamentos']);
  });

  it('nega sem a página, permite com a página, admin isento', () => {
    expect(canAccessPage('viewer', [], '/orcamentos')).toBe(false);
    expect(canAccessPage('editor', ['/cadastro/documentos'], '/orcamentos')).toBe(false);
    expect(canAccessApi('viewer', ['/cadastro/documentos'], '/api/orcamentos')).toBe(false);
    expect(canAccessPage('viewer', ['/orcamentos'], '/orcamentos')).toBe(true);
    expect(canAccessApi('viewer', ['/orcamentos'], '/api/orcamentos/x/pdf')).toBe(true);
    expect(canAccessPage('admin', [], '/orcamentos')).toBe(true);
  });

  it('o middleware exige sessão em /orcamentos', () => {
    expect(middlewareConfig.matcher).toEqual(expect.arrayContaining(['/orcamentos/:path*']));
  });

  it('Orçamentos não abre o admin de produtos nem a ficha de clientes', () => {
    expect(canAccessApi('viewer', ['/orcamentos'], '/api/products')).toBe(false);
    expect(canAccessApi('viewer', ['/orcamentos'], '/api/customers')).toBe(false);
    expect(canAccessApi('viewer', ['/orcamentos'], '/api/contacts')).toBe(false);
  });
});
