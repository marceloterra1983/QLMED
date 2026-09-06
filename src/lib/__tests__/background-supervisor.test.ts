import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundSupervisor } from '@/lib/background-supervisor';

describe('background-supervisor', () => {
  let supervisor: BackgroundSupervisor;

  beforeEach(() => {
    vi.useFakeTimers();
    supervisor = new BackgroundSupervisor();
    delete process.env.QLMED_DISABLE_BACKGROUND_SERVICES;
  });

  afterEach(async () => {
    await supervisor.stopAll();
    vi.useRealTimers();
  });

  it('registers services with metadata and delays', () => {
    supervisor.register({
      name: 'auto-sync',
      description: 'Auto Sync SEFAZ',
      delayMs: 10_000,
      start: vi.fn(),
    });

    const registered = supervisor.getRegisteredServices();
    expect(registered).toHaveLength(1);
    expect(registered[0]).toEqual({
      service: 'auto-sync',
      registered: true,
      started: false,
      delayMs: 10_000,
    });
  });

  it('honors QLMED_DISABLE_BACKGROUND_SERVICES flag', () => {
    process.env.QLMED_DISABLE_BACKGROUND_SERVICES = 'true';
    const start = vi.fn();

    supervisor.register({
      name: 'auto-sync',
      description: 'Auto Sync',
      delayMs: 1_000,
      start,
    });

    supervisor.startAll();
    vi.advanceTimersByTime(2_000);
    expect(start).not.toHaveBeenCalled();
  });

  it('starts services after their specific delay', async () => {
    const startSync = vi.fn();
    const startIngest = vi.fn();

    supervisor
      .register({
        name: 'auto-sync',
        description: 'Auto Sync',
        delayMs: 1_000,
        start: startSync,
      })
      .register({
        name: 'impcg-mail-ingest',
        description: 'IMPCG',
        delayMs: 2_500,
        start: startIngest,
      });

    supervisor.startAll();

    vi.advanceTimersByTime(500);
    expect(startSync).not.toHaveBeenCalled();
    expect(startIngest).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600); // 1100ms
    expect(startSync).toHaveBeenCalledTimes(1);
    expect(startIngest).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500); // 2600ms
    expect(startIngest).toHaveBeenCalledTimes(1);
  });

  it('cancels pending startup timers on stopAll()', async () => {
    const start = vi.fn();
    const stop = vi.fn();

    supervisor.register({
      name: 'daily-issued-summary',
      description: 'Summary',
      delayMs: 5_000,
      start,
      stop,
    });

    supervisor.startAll();
    vi.advanceTimersByTime(2_000);

    await supervisor.stopAll();
    vi.advanceTimersByTime(5_000);

    expect(start).not.toHaveBeenCalled();
  });
});
