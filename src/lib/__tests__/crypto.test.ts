import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt } from '../crypto';

beforeAll(() => {
  // Set a test encryption key (must be present for crypto to work)
  process.env.ENCRYPTION_KEY = 'test-encryption-key-for-vitest-32chars!';
});

describe('encrypt / decrypt round-trip', () => {
  it('encrypts and decrypts a simple string', () => {
    const plaintext = 'Hello, QLMED!';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('encrypts and decrypts an empty string', () => {
    const encrypted = encrypt('');
    expect(decrypt(encrypted)).toBe('');
  });

  it('encrypts and decrypts unicode / special characters', () => {
    const plaintext = 'Inscrição Estadual: São Paulo — café & açúcar 🇧🇷';
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random salt)', () => {
    const plaintext = 'deterministic?';
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it('new format has 4 colon-separated parts', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    expect(parts.length).toBe(4);
  });
});

describe('decrypt edge cases', () => {
  it('returns unencrypted text as-is (backward compatibility)', () => {
    expect(decrypt('plain-text-no-colons')).toBe('plain-text-no-colons');
  });
});

describe('encrypt without ENCRYPTION_KEY', () => {
  it('throws when ENCRYPTION_KEY is missing', () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY');
    process.env.ENCRYPTION_KEY = saved;
  });
});
