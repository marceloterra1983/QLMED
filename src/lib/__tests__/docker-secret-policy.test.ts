import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');

describe('Docker secret policy', () => {
  it('does not pass the runtime API key through image build arguments', () => {
    const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');
    const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');
    const productionCompose = readFileSync(resolve(root, 'production/docker-compose.yml'), 'utf8');

    expect(dockerfile).not.toMatch(/ARG QLMED_API_KEY|ENV QLMED_API_KEY=\$\{QLMED_API_KEY\}/);
    expect(compose).not.toMatch(/\n\s+QLMED_API_KEY:\s+\$\{QLMED_API_KEY/);
    expect(productionCompose).not.toMatch(/\n\s+QLMED_API_KEY:\s+\$\{QLMED_API_KEY/);
  });
});
