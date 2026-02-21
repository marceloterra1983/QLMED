import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const LEGACY_SALT = 'qlmed-salt';

function deriveKey(salt: Buffer): Buffer {
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

  // Not encrypted - return as-is for backward compatibility
  return encryptedText;
}
