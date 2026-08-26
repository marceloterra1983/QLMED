import { beforeEach, describe, expect, it } from 'vitest';
import {
  getBackgroundServiceHealth,
  markBackgroundServiceHeartbeat,
  markBackgroundServiceStarted,
} from '@/lib/background-service-health';

describe('background service health', () => {
  beforeEach(() => {
    delete (globalThis as { __qlmedBackgroundServiceHealth?: unknown }).__qlmedBackgroundServiceHealth;
  });

  it('records startup and heartbeat timestamps without exposing errors by default', () => {
    markBackgroundServiceStarted('auto-sync');
    markBackgroundServiceHeartbeat('auto-sync');

    expect(getBackgroundServiceHealth()).toMatchObject({
      'auto-sync': {
        status: 'running',
      },
    });
    expect(getBackgroundServiceHealth()['auto-sync']?.lastHeartbeatAt).toEqual(expect.any(String));
  });
});
