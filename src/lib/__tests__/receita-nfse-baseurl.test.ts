import { describe, expect, it } from 'vitest';
import { ReceitaNfseClient, RECEITA_NFSE_ALLOWED_HOSTS } from '@/lib/receita-nfse-client';
import { receitaNfseConfigSchema, receitaNfseTestSchema } from '@/lib/schemas/receita';

// PEMs de fachada: o construtor tem de recusar ANTES de qualquer handshake,
// então material criptográfico válido nem chega a ser necessário.
const FAKE_CERT = '-----BEGIN CERTIFICATE-----\nnao-usado\n-----END CERTIFICATE-----';
const FAKE_KEY = '-----BEGIN PRIVATE KEY-----\nnao-usado\n-----END PRIVATE KEY-----';

function build(baseUrl: string) {
  return new ReceitaNfseClient({
    baseUrl,
    apiToken: 'token',
    certPem: FAKE_CERT,
    keyPem: FAKE_KEY,
  });
}

describe('INT-010 — baseUrl da Receita não pode desviar o certificado de cliente', () => {
  it.each(RECEITA_NFSE_ALLOWED_HOSTS)('aceita o host oficial %s', (host) => {
    expect(() => build(`https://${host}/contribuintes`)).not.toThrow();
  });

  it('recusa host arbitrário — o e-CNPJ não é apresentado a terceiro', () => {
    expect(() => build('https://attacker.test/contribuintes')).toThrow(/fora da allowlist/);
  });

  it('recusa http:// em claro', () => {
    expect(() => build('http://adn.nfse.gov.br/contribuintes')).toThrow(/não é https/);
  });

  it('recusa loopback e metadados de nuvem', () => {
    expect(() => build('https://127.0.0.1/contribuintes')).toThrow(/privado ou loopback/);
    expect(() => build('https://169.254.169.254/latest/meta-data')).toThrow(
      /privado ou loopback/,
    );
  });

  it('recusa string que não é URL — era z.string() puro', () => {
    expect(() => build('adn.nfse.gov.br')).toThrow(/inválida/);
  });

  it('schema de gravação rejeita baseUrl fora do ADN', () => {
    expect(receitaNfseConfigSchema.safeParse({ baseUrl: 'https://attacker.test' }).success).toBe(
      false,
    );
    expect(receitaNfseTestSchema.safeParse({ baseUrl: 'http://adn.nfse.gov.br' }).success).toBe(
      false,
    );
  });

  it('schema mantém vazio/ausente como "usar o padrão do ambiente"', () => {
    expect(receitaNfseConfigSchema.safeParse({}).success).toBe(true);
    expect(receitaNfseConfigSchema.safeParse({ baseUrl: null }).success).toBe(true);
    expect(receitaNfseConfigSchema.safeParse({ baseUrl: '' }).success).toBe(true);
    expect(
      receitaNfseConfigSchema.safeParse({ baseUrl: 'https://adn.nfse.gov.br/contribuintes' })
        .success,
    ).toBe(true);
  });
});
