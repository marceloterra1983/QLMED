import { describe, expect, it } from 'vitest';
import { receitaNfseConfigSchema, receitaNfseTestSchema } from '@/lib/schemas/receita';

describe('Receita NFS-e base URL validation', () => {
  it('accepts the official production and restricted hosts', () => {
    expect(receitaNfseConfigSchema.safeParse({
      environment: 'production',
      baseUrl: 'https://adn.nfse.gov.br/contribuintes',
    }).success).toBe(true);
    expect(receitaNfseTestSchema.safeParse({
      environment: 'production-restricted',
      baseUrl: 'https://adn.producaorestrita.nfse.gov.br/contribuintes',
    }).success).toBe(true);
  });

  it('rejects non-HTTPS, private, credential-bearing, and unapproved hosts', () => {
    for (const baseUrl of [
      'http://adn.nfse.gov.br/contribuintes',
      'https://127.0.0.1/contribuintes',
      'https://user:pass@adn.nfse.gov.br/contribuintes',
      'https://evil.example/contribuintes',
    ]) {
      expect(receitaNfseConfigSchema.safeParse({ baseUrl }).success).toBe(false);
    }
  });

  it('requires the URL host to match the selected environment', () => {
    expect(receitaNfseConfigSchema.safeParse({
      environment: 'production',
      baseUrl: 'https://adn.producaorestrita.nfse.gov.br/contribuintes',
    }).success).toBe(false);
    expect(receitaNfseTestSchema.safeParse({
      environment: 'production-restricted',
      baseUrl: 'https://adn.nfse.gov.br/contribuintes',
    }).success).toBe(false);
  });
});
