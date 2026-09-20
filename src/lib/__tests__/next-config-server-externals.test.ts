import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

describe('next.config serverExternalPackages', () => {
  it('mantém pacotes nativos/pesados fora do bundle RSC', () => {
    const config = readFileSync(resolve(root, 'next.config.mjs'), 'utf8');
    for (const pkg of ['bcryptjs', 'node-forge', 'xml2js', 'exceljs', 'jszip', 'puppeteer-core']) {
      expect(config, pkg).toContain(`'${pkg}'`);
    }
  });
});
