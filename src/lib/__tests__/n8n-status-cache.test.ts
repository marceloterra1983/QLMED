import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCachedN8nStatus,
  clearN8nStatusCache,
  N8N_STATUS_CACHE_TTL_MS,
} from '@/lib/n8n-status-cache';
import type { N8nStatusResult } from '@/lib/n8n-client';

const OK: N8nStatusResult = {
  state: 'ok',
  workflows: [{ id: '1', name: 'Sync NF-e', active: true }],
  fetchedAt: '2026-08-26T12:00:00.000Z',
};
const FORA: N8nStatusResult = { state: 'unavailable', reason: 'network' };

beforeEach(() => clearN8nStatusCache());

describe('getCachedN8nStatus', () => {
  // A prova de FR-005: a carga sobre o n8n não acompanha o número de
  // administradores com a tela aberta.
  it('N pedidos dentro da janela resultam em UMA consulta ao n8n', async () => {
    const load = vi.fn(async () => OK);
    const t = 1_000_000;
    for (let i = 0; i < 10; i++) {
      await getCachedN8nStatus(load, t + i * 100);
    }
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('passada a janela, consulta de novo', async () => {
    const load = vi.fn(async () => OK);
    const t = 1_000_000;
    await getCachedN8nStatus(load, t);
    await getCachedN8nStatus(load, t + N8N_STATUS_CACHE_TTL_MS + 1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('declara se veio do cache e qual a idade', async () => {
    const load = vi.fn(async () => OK);
    const t = 1_000_000;
    const primeiro = await getCachedN8nStatus(load, t);
    expect(primeiro.cached).toBe(false);
    expect(primeiro.ageMs).toBe(0);

    const segundo = await getCachedN8nStatus(load, t + 5_000);
    expect(segundo.cached).toBe(true);
    expect(segundo.ageMs).toBe(5_000);
  });

  // Escolha conservadora de D3: em falha, NÃO servir o valor antigo.
  it('falha NÃO entra no cache — nunca vira "ok" antigo depois', async () => {
    const t = 1_000_000;
    await getCachedN8nStatus(async () => FORA, t);
    const load = vi.fn(async () => FORA);
    await getCachedN8nStatus(load, t + 100);
    expect(load).toHaveBeenCalledTimes(1); // consultou de novo: nada foi guardado
  });

  it('depois de um ok, uma falha devolve a FALHA — não o ok guardado', async () => {
    const t = 1_000_000;
    await getCachedN8nStatus(async () => OK, t);
    const depois = await getCachedN8nStatus(
      async () => FORA,
      t + N8N_STATUS_CACHE_TTL_MS + 1,
    );
    expect(depois.state).toBe('unavailable');
    expect(depois).not.toHaveProperty('workflows');
  });

  it('clearN8nStatusCache força nova consulta', async () => {
    const load = vi.fn(async () => OK);
    const t = 1_000_000;
    await getCachedN8nStatus(load, t);
    clearN8nStatusCache();
    await getCachedN8nStatus(load, t + 100);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
