import { describe, expect, it } from 'vitest';
import {
  generateOneDriveOAuthState,
  isValidOneDriveOAuthState,
  ONEDRIVE_OAUTH_STATE_TTL_SECONDS,
  oneDriveOAuthStateCookieOptions,
} from '../onedrive-oauth-state';

describe('onedrive oauth state', () => {
  it('generates high-entropy url-safe states', () => {
    const first = generateOneDriveOAuthState();
    const second = generateOneDriveOAuthState();

    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(first).not.toBe(second);
  });

  it('validates states with exact equality only', () => {
    const state = generateOneDriveOAuthState();

    expect(isValidOneDriveOAuthState(state, state)).toBe(true);
    expect(isValidOneDriveOAuthState(`${state}x`, state)).toBe(false);
    expect(isValidOneDriveOAuthState('', state)).toBe(false);
    expect(isValidOneDriveOAuthState(state, null)).toBe(false);
  });

  it('sets short-lived httpOnly cookie options', () => {
    const options = oneDriveOAuthStateCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.maxAge).toBe(ONEDRIVE_OAUTH_STATE_TTL_SECONDS);
    expect(options.path).toBe('/');
  });
});
