import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { ICP_BRASIL_V10_PEM } from '@/lib/certs/icp-brasil-v10';

/**
 * REAUD-B-18: `RECEITA_NFSE_VERIFY_SSL=false` desligava a verificação do
 * certificado do servidor num canal mTLS que apresenta o e-CNPJ, e o canal da
 * Receita não recebia a raiz ICP-Brasil que já resolvia o problema para a
 * SEFAZ. Agora o client recebe o mesmo bundle e o interruptor, se usado,
 * grita em `error` com o host a cada request.
 */

const logError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const FAKE_CERT = '-----BEGIN CERTIFICATE-----\nnao-usado\n-----END CERTIFICATE-----';
const FAKE_KEY = '-----BEGIN PRIVATE KEY-----\nnao-usado\n-----END PRIVATE KEY-----';
const BASE_URL = 'https://adn.nfse.gov.br/contribuintes';

/** Captura as opções TLS e falha a request de imediato: nada sai para a rede. */
function captureHttpsRequest() {
  const seen: https.RequestOptions[] = [];
  vi.spyOn(https, 'request').mockImplementation(((_url: unknown, options: https.RequestOptions) => {
    seen.push(options);
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => queueMicrotask(() => req.emit('error', new Error('rede desligada no teste')));
    return req;
  }) as unknown as typeof https.request);
  return seen;
}

async function buildClient() {
  const { ReceitaNfseClient } = await import('@/lib/receita-nfse-client');
  const { receitaRequestTls } = await import('@/lib/ssl-verify');
  return new ReceitaNfseClient({
    baseUrl: BASE_URL,
    certPem: FAKE_CERT,
    keyPem: FAKE_KEY,
    ...receitaRequestTls(),
  });
}

describe('ReceitaNfseClient — TLS do canal da Receita', () => {
  const prev = process.env.RECEITA_NFSE_VERIFY_SSL;

  beforeEach(() => {
    logError.mockClear();
    delete process.env.RECEITA_NFSE_VERIFY_SSL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (prev === undefined) delete process.env.RECEITA_NFSE_VERIFY_SSL;
    else process.env.RECEITA_NFSE_VERIFY_SSL = prev;
  });

  it('apresenta ao https.request o bundle Mozilla + raiz ICP-Brasil v10, com verificação ligada', async () => {
    const seen = captureHttpsRequest();
    const client = await buildClient();

    await expect(client.fetchDfeByNsu('1')).rejects.toThrow('rede desligada');

    expect(seen).toHaveLength(1);
    expect(seen[0].rejectUnauthorized).toBe(true);
    expect(seen[0].ca).toContain(ICP_BRASIL_V10_PEM);
    expect(logError).not.toHaveBeenCalled();
  });

  it('sem `ca` explícito o client não inventa um: Node usa o store padrão', async () => {
    const { ReceitaNfseClient } = await import('@/lib/receita-nfse-client');
    const seen = captureHttpsRequest();

    const client = new ReceitaNfseClient({ baseUrl: BASE_URL, certPem: FAKE_CERT, keyPem: FAKE_KEY });
    await expect(client.fetchDfeByNsu('1')).rejects.toThrow();

    expect(seen[0].ca).toBeUndefined();
    expect(seen[0].rejectUnauthorized).toBe(true);
  });

  it('RECEITA_NFSE_VERIFY_SSL=false: desliga a verificação e loga error com o host em CADA request', async () => {
    process.env.RECEITA_NFSE_VERIFY_SSL = 'false';
    const seen = captureHttpsRequest();
    const client = await buildClient();

    await expect(client.fetchDfeByNsu('1')).rejects.toThrow();
    await expect(client.fetchDfeByNsu('2')).rejects.toThrow();

    expect(seen.map((o) => o.rejectUnauthorized)).toEqual([false, false]);
    expect(logError).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalledWith({ host: 'adn.nfse.gov.br' }, 'tls_verification_disabled');
  });
});
