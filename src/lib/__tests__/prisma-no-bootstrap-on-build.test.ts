import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

describe('SPEC-084: next build não sobe rotinas de fundo', () => {
  it('prisma.ts ignora bootstrap em phase-production-build', () => {
    const src = readFileSync(resolve(root, 'src/lib/prisma.ts'), 'utf8');
    expect(src).toContain("process.env.NEXT_PHASE !== 'phase-production-build'");
    expect(src).toContain("process.env.QLMED_DISABLE_BACKGROUND_SERVICES !== 'true'");
  });

  it('job app do CI declara QLMED_DISABLE_BACKGROUND_SERVICES', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain("QLMED_DISABLE_BACKGROUND_SERVICES: 'true'");
  });
});
