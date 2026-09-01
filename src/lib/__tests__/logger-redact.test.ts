import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { Writable } from 'stream';
import { loggerOptions } from '../logger';

/**
 * OBS-001: o que interessa é a AUSÊNCIA do segredo na saída, não a presença
 * do marcador. Cada caso monta um pino com as MESMAS opções do logger real
 * sobre um stream de memória e procura a string literal do segredo.
 */
function capture(fn: (log: pino.Logger) => void): string {
  let out = '';
  const sink = new Writable({
    write(chunk, _enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  const log = pino({ ...loggerOptions, level: 'trace' }, sink);
  fn(log);
  return out;
}

const SECRET = 'S3GR3D0-QUE-NAO-PODE-VAZAR';

describe('logger redact — o segredo não aparece na saída', () => {
  it('não vaza o payload do webhook notify (o caso do finding)', () => {
    const out = capture((log) => {
      log.info({ payload: { xml: SECRET } }, '[n8n webhook] Notification');
    });

    expect(out).not.toContain(SECRET);
    expect(out).toContain('[REDACTED]');
  });

  it.each([
    'password',
    'pfxData',
    'pfxPassword',
    'xmlContent',
    'signedXml',
    'protocolXml',
    'apiToken',
    'accessToken',
    'refreshToken',
    'authorization',
    'secret',
  ])('não vaza o campo %s na raiz', (field) => {
    const out = capture((log) => {
      log.info({ [field]: SECRET }, 'teste');
    });

    expect(out).not.toContain(SECRET);
  });

  it.each(['pfxPassword', 'signedXml', 'apiToken'])(
    'não vaza %s aninhado um nível',
    (field) => {
      const out = capture((log) => {
        log.info({ cert: { [field]: SECRET } }, 'teste');
      });

      expect(out).not.toContain(SECRET);
    },
  );

  it('não vaza um segredo aninhado dois níveis', () => {
    const out = capture((log) => {
      log.info({ ctx: { cert: { pfxPassword: SECRET } } }, 'teste');
    });

    expect(out).not.toContain(SECRET);
  });

  it('não vaza o header Authorization', () => {
    const out = capture((log) => {
      log.info({ req: { headers: { authorization: `Bearer ${SECRET}` } } }, 'teste');
    });

    expect(out).not.toContain(SECRET);
  });

  it('mantém os campos não sensíveis legíveis', () => {
    const out = capture((log) => {
      log.info({ invoiceId: 'inv-123', durationMs: 42 }, 'ok');
    });

    expect(out).toContain('inv-123');
    expect(out).toContain('42');
  });
});
