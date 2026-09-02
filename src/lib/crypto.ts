import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const LEGACY_SALT = 'qlmed-salt';

export function deriveKey(salt: Buffer): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY não configurada. Adicione ao .env');
  }
  return crypto.scryptSync(key, salt, 32);
}

export function encrypt(text: string): string {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Format: salt:iv:authTag:encrypted (4 parts = new format with random salt)
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Forma exata do que `encrypt()` produz e `decrypt()` lê: salt, iv e authTag
 * têm 16 bytes (32 hex cada), o ciphertext é hex de comprimento par (vazio
 * para `encrypt('')`); o formato legado é o mesmo sem o salt. Contar `:` não
 * chega — um segredo em claro com dois ou três dois-pontos passava por
 * cifrado e a migração o pulava em silêncio (REAUD-B-08).
 */
const ENCRYPTED_TEXT = /^(?:[0-9a-f]{32}:){2,3}(?:[0-9a-f]{2})*$/i;

export function isEncryptedText(value: string): boolean {
  return ENCRYPTED_TEXT.test(value);
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');

  if (parts.length === 4) {
    // New format: salt:iv:authTag:encrypted
    const [saltHex, ivHex, authTagHex, encrypted] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const key = deriveKey(salt);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  if (parts.length === 3) {
    // Legacy format: iv:authTag:encrypted (hardcoded salt)
    const [ivHex, authTagHex, encrypted] = parts;
    const key = deriveKey(Buffer.from(LEGACY_SALT));
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Fail-closed. Devolver o input quando ele não está num dos dois formatos
  // conhecidos transformava "segredo gravado em claro" num caminho de sucesso
  // silencioso — nada no sistema conseguia distinguir um token cifrado de um
  // token em claro. Auditoria FILE-007.
  throw new Error(
    'Valor cifrado em formato desconhecido: esperado "salt:iv:authTag:ciphertext". '
    + 'Se este segredo foi gravado em texto claro, regrave-o pela UI ou rode '
    + 'scripts/migrate-plaintext-secrets.ts.',
  );
}
