import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { config as middlewareConfig } from '@/middleware';

function readApp(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

/**
 * Substitui os planos TestSprite (FE pago) por contratos no repo.
 * Planos originais: testsprite-plans/01–08.
 */
describe('paridade TestSprite (planos públicos)', () => {
  const home = readApp('src/app/page.tsx');
  const sobre = readApp('src/app/sobre/page.tsx');
  const register = readApp('src/app/register/page.tsx');
  const login = readApp('src/app/login/page.tsx');

  it('Raiz — visitante sem sessão vai para /login', () => {
    expect(home).toMatch(/getServerSession/);
    expect(home).toMatch(/redirect\(session \? '\/fiscal\/invoices' : '\/login'\)/);
  });

  it('Sobre — institucional pública permanece em /sobre', () => {
    expect(sobre).toMatch(/QL MED Produtos Hospitalares/);
    expect(sobre).toMatch(/title: 'Sobre/);
    expect(sobre).not.toMatch(/getServerSession|requireAuth|redirect\('\/login'\)/);
  });

  it('Register — cadastro público redireciona ao login (comportamento atual)', () => {
    expect(register).toMatch(/redirect\('\/login'\)/);
  });

  it('Login — senha obrigatória; erro Senha inválida; sem Google SSO', () => {
    expect(login).toMatch(/Senha de acesso/);
    expect(login).toMatch(/required/);
    expect(login).toMatch(/Senha inválida/);
    expect(login).not.toMatch(/type=["']email["']/);
    expect(login).not.toMatch(/GoogleProvider|signIn\(['"]google['"]/);
  });

  it('Fiscal e Financeiro — matcher do middleware exige sessão', () => {
    expect(middlewareConfig.matcher).toEqual(
      expect.arrayContaining(['/fiscal/:path*', '/financeiro/:path*', '/gestao/:path*', '/api/:path*']),
    );
    expect(middlewareConfig.matcher.join(' ')).not.toMatch(/\/sobre/);
    expect(middlewareConfig.matcher.join(' ')).not.toMatch(/\/login/);
  });
});
