import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('lock da cópia OneDrive/local', () => {
  it('adquire copyingFromSource antes de qualquer runCopyFromOneDrive', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/local-xml-sync/sync-scheduler.ts'), 'utf8');
    const start = src.indexOf('async function runCopyFromSource');
    const end = src.indexOf('async function runFullReconciliation');
    const fn = src.slice(start, end);

    expect(fn).toContain('if (copyingFromSource) return');
    expect(fn.indexOf('copyingFromSource = true')).toBeGreaterThan(fn.indexOf('if (copyingFromSource) return'));
    expect(fn.indexOf('runCopyFromOneDrive')).toBeGreaterThan(fn.indexOf('copyingFromSource = true'));
  });
});
