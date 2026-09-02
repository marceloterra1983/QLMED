import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt, isEncryptedText } from '../crypto';

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

describe('decrypt fail-closed (FILE-007)', () => {
  // Este bloco substitui o teste "returns unencrypted text as-is": ele fixava
  // exatamente o defeito — devolver o input transformava um segredo gravado em
  // claro num caminho de sucesso indistinguível de um segredo cifrado.
  it('throws instead of returning plaintext without separators', () => {
    expect(() => decrypt('plain-text-no-colons')).toThrow('formato desconhecido');
  });

  it('throws for a value with the wrong number of parts', () => {
    expect(() => decrypt('a:b')).toThrow('formato desconhecido');
    expect(() => decrypt('a:b:c:d:e')).toThrow('formato desconhecido');
  });

  it('throws for an empty value', () => {
    expect(() => decrypt('')).toThrow('formato desconhecido');
  });

  it('throws for a tampered ciphertext instead of returning garbage', () => {
    const encrypted = encrypt('segredo');
    const parts = encrypted.split(':');
    parts[3] = parts[3].replace(/^./, (c) => (c === 'a' ? 'b' : 'a'));

    expect(() => decrypt(parts.join(':'))).toThrow();
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

describe('isEncryptedText (REAUD-B-08)', () => {
  it('aceita a saída de encrypt(), inclusive de string vazia', () => {
    expect(isEncryptedText(encrypt('segredo'))).toBe(true);
    expect(isEncryptedText(encrypt(''))).toBe(true);
  });

  it('aceita o formato legado de 3 partes (iv:authTag:ct)', () => {
    const [, iv, tag, ct] = encrypt('segredo').split(':');
    expect(isEncryptedText(`${iv}:${tag}:${ct}`)).toBe(true);
  });

  it('recusa texto claro com dois ou três dois-pontos — contar ":" não chega', () => {
    expect(isEncryptedText('part:part:part')).toBe(false);
    expect(isEncryptedText('senha:com:dois-pontos')).toBe(false);
    expect(isEncryptedText('user:senha:123:x')).toBe(false);
    expect(isEncryptedText('a:b:c:d')).toBe(false);
  });

  it('recusa hex na largura errada', () => {
    const enc = encrypt('segredo');
    expect(isEncryptedText(enc.slice(1))).toBe(false);
    expect(isEncryptedText(`${enc}0`)).toBe(false);
  });
});
