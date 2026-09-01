import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const loginPage = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../page.tsx'),
  'utf8',
);

/**
 * ADR-0012 / SPEC-019: trava anti-auditoria.
 * Se uma revisão recolocar e-mail no login, este teste quebra de propósito.
 * Não “corrigir” o teste — substituir a ADR com o dono.
 */
describe('login page contract (ADR-0012)', () => {
  it('does not ask for email — password is the identity', () => {
    expect(loginPage).not.toMatch(/type=["']email["']/);
    expect(loginPage).not.toMatch(/setEmail/);
    expect(loginPage).not.toMatch(/autoComplete=["']email["']/);
    expect(loginPage).not.toMatch(/placeholder=["']seu@email\.com["']/);
    expect(loginPage).not.toMatch(/Email ou senha/);
    expect(loginPage).toMatch(/type=["']password["']/);
    expect(loginPage).toMatch(/Senha de acesso/);
    expect(loginPage).toMatch(/ADR-0012/);
  });

  it('mostra marca, Entrar e bloqueia envio vazio (planos TestSprite login)', () => {
    expect(loginPage).toMatch(/alt=["']QL MED Logo["']/);
    // O rótulo é uma string do JSX; a regra anterior exigia "Entrar" sozinho
    // numa linha, um detalhe de formatação que a migração para <Button> mudou.
    expect(loginPage).toMatch(/['"]Entrar['"]/);
    expect(loginPage).toMatch(/<Button[^>]*type="submit"/);
    expect(loginPage).toMatch(/required/);
    expect(loginPage).toMatch(/setError\('Senha inválida'\)/);
    expect(loginPage).toMatch(/router\.push\('\/fiscal\/invoices'\)/);
    expect(loginPage).not.toMatch(/signIn\(['"]google['"]/);
  });
});
