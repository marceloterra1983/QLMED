import { describe, expect, it } from 'vitest';
import { shouldDownloadRemoteFile } from '@/lib/local-xml-sync/onedrive-client';

describe('shouldDownloadRemoteFile', () => {
  it('não baixa de novo quando tamanho e mtime local cobrem o remoto', () => {
    expect(
      shouldDownloadRemoteFile({
        remoteSize: 1000,
        remoteMtimeMs: 1_000,
        localSize: 1000,
        localMtimeMs: 1_000,
      }),
    ).toBe(false);
  });

  it('baixa quando o tamanho diverge', () => {
    expect(
      shouldDownloadRemoteFile({
        remoteSize: 2000,
        remoteMtimeMs: 1_000,
        localSize: 1000,
        localMtimeMs: 2_000,
      }),
    ).toBe(true);
  });

  it('baixa quando o arquivo local ainda não existe', () => {
    expect(
      shouldDownloadRemoteFile({
        remoteSize: 1000,
        remoteMtimeMs: 1_000,
      }),
    ).toBe(true);
  });

  it('não rebaixa só porque o Graph omitiu size — arquivo local não-vazio basta', () => {
    expect(
      shouldDownloadRemoteFile({
        remoteSize: null,
        remoteMtimeMs: Number.NaN,
        localSize: 4096,
        localMtimeMs: Date.now(),
      }),
    ).toBe(false);
  });
});
