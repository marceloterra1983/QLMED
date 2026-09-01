import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebhookSignature } from '@/lib/n8n-webhook-security';

/**
 * Captura o que a rota ENTREGA ao logger.
 *
 * Uma primeira versão deste teste espiava `process.stdout.write` e passava com
 * e sem a correção — o pino escreve no descritor por baixo do `process.stdout`,
 * então a espia nunca via nada e o teste não protegia coisa alguma. O ponto de
 * observação correto é a fronteira que a rota controla: o objeto passado ao
 * logger. O que o logger faz depois disso é da folha L4.
 */
const logged: unknown[] = [];

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: (obj: unknown) => logged.push(obj),
    warn: (obj: unknown) => logged.push(obj),
    error: (obj: unknown) => logged.push(obj),
    debug: (obj: unknown) => logged.push(obj),
  }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $executeRaw: async (strings: TemplateStringsArray) =>
      strings.join('?').includes('INSERT') ? 1 : 0,
  },
}));

const { POST } = await import('@/app/api/webhooks/n8n/route');

describe('INT-006 — o payload de notify não pode chegar ao log', () => {
  beforeEach(() => {
    logged.length = 0;
    process.env.QLMED_API_KEY = 'test-key';
    process.env.N8N_WEBHOOK_SECRET = 'shared-secret';
  });

  afterEach(() => {
    delete process.env.QLMED_API_KEY;
    delete process.env.N8N_WEBHOOK_SECRET;
  });

  it('nem as chaves nem os valores do payload são entregues ao logger', async () => {
    const body = {
      action: 'notify',
      payload: { cpfDoPaciente: '99988877766', segredo: 'token-que-nao-pode-vazar' },
    };
    const rawBody = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = 'nonce-int006';

    const response = await POST(
      new NextRequest('http://localhost/api/webhooks/n8n', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test-key',
          'x-qlmed-timestamp': timestamp,
          'x-qlmed-nonce': nonce,
          'x-qlmed-signature': createWebhookSignature('shared-secret', timestamp, nonce, rawBody),
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(200);
    expect(logged).toHaveLength(1);

    const serializado = JSON.stringify(logged);
    expect(serializado).not.toContain('cpfDoPaciente');
    expect(serializado).not.toContain('99988877766');
    expect(serializado).not.toContain('token-que-nao-pode-vazar');
    // O que sobra é forma, não conteúdo.
    expect(logged[0]).toEqual({ payloadKeys: 2 });
  });
});
