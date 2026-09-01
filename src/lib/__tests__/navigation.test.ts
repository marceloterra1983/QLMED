import { describe, it, expect } from 'vitest';
import {
  canAccessApi,
  canAccessPage,
  PAGE_GROUPS,
  requiredPagesForApi,
  VALID_PAGE_PATHS,
} from '../navigation';

describe('navigation ACL helpers', () => {
  describe('canAccessPage', () => {
    it('admin bypasses allowedPages', () => {
      expect(canAccessPage('admin', ['/fiscal/invoices'], '/sistema/usuarios')).toBe(true);
    });

    // AUTH-005: era "utilizador legado ganha tudo". Passou a negar.
    it('empty allowedPages grants nothing', () => {
      expect(canAccessPage('viewer', [], '/fiscal/dashboard')).toBe(false);
      expect(canAccessPage('viewer', undefined, '/fiscal/dashboard')).toBe(false);
    });

    it('explicit list restricts a viewer', () => {
      expect(canAccessPage('viewer', ['/fiscal/invoices'], '/fiscal/invoices')).toBe(true);
      expect(canAccessPage('viewer', ['/fiscal/invoices'], '/sistema/usuarios')).toBe(false);
    });

    it('explicit list restricts an editor', () => {
      expect(canAccessPage('editor', ['/financeiro/contas-pagar'], '/financeiro/contas-pagar')).toBe(true);
      expect(canAccessPage('editor', ['/financeiro/contas-pagar'], '/financeiro/contas-receber')).toBe(false);
    });
  });

  describe('canAccessApi', () => {
    it('admin bypasses everywhere', () => {
      expect(canAccessApi('admin', ['/fiscal/invoices'], '/api/users')).toBe(true);
    });

    it('non-page-gated APIs allowed for any authenticated user', () => {
      expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/health')).toBe(true);
      expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/auth/session')).toBe(true);
    });

    it('viewer with only /fiscal pages cannot call /api/financeiro', () => {
      expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/financeiro/contas-pagar')).toBe(false);
    });

    it('viewer with /financeiro page can call /api/financeiro subroutes', () => {
      expect(canAccessApi('viewer', ['/financeiro/contas-pagar'], '/api/financeiro/contas-pagar/list')).toBe(true);
    });

    it('API prefix mapped to multiple pages passes if ANY is allowed', () => {
      // /api/contacts maps to both clientes and fornecedores; having either unlocks it
      expect(canAccessApi('viewer', ['/cadastro/clientes'], '/api/contacts/search')).toBe(true);
      expect(canAccessApi('viewer', ['/cadastro/fornecedores'], '/api/contacts/search')).toBe(true);
      expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/contacts/search')).toBe(false);
    });

    it('empty allowedPages denies a page-gated API', () => {
      expect(canAccessApi('viewer', [], '/api/users')).toBe(false);
    });
  });

  describe('requiredPagesForApi', () => {
    it('returns empty for non-gated APIs', () => {
      expect(requiredPagesForApi('/api/health')).toEqual([]);
      expect(requiredPagesForApi('/api/auth/session')).toEqual([]);
      expect(requiredPagesForApi('/api/webhooks/n8n')).toEqual([]);
    });

    it('returns correct pages for known prefixes', () => {
      expect(requiredPagesForApi('/api/users')).toContain('/sistema/usuarios');
      expect(requiredPagesForApi('/api/users/123')).toContain('/sistema/usuarios');
      expect(requiredPagesForApi('/api/estoque/entrada')).toContain('/estoque/entrada-nfe');
    });

    it('every mapped page appears in VALID_PAGE_PATHS', () => {
      const allMappedPages = new Set<string>();
      for (const p of ['/api/invoices', '/api/financeiro', '/api/users', '/api/products', '/api/anvisa', '/api/estoque', '/api/reports'].flatMap(requiredPagesForApi)) {
        allMappedPages.add(p);
      }
      for (const page of allMappedPages) {
        expect(VALID_PAGE_PATHS.has(page)).toBe(true);
      }
    });

    it('anvisa APIs are gated by produtos, not a standalone page', () => {
      expect(VALID_PAGE_PATHS.has('/cadastro/anvisa')).toBe(false);
      expect(PAGE_GROUPS.find((g) => g.section === 'Cadastros')?.pages.map((p) => p.path)).toEqual([
        '/cadastro/produtos',
        '/cadastro/clientes',
        '/cadastro/fornecedores',
      ]);
      expect(requiredPagesForApi('/api/anvisa')).toEqual(['/cadastro/produtos']);
      expect(requiredPagesForApi('/api/anvisa/validate')).toEqual(['/cadastro/produtos']);
      expect(canAccessApi('viewer', ['/cadastro/produtos'], '/api/anvisa/validate')).toBe(true);
      expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/anvisa/validate')).toBe(false);
    });
  });
});
