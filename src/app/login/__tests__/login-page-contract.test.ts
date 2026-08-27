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
});
