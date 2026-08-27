const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;

export function normalizePushEndpoint(raw: string): string {
  const endpoint = raw.trim();
  if (!endpoint) {
    throw new Error('Push endpoint is empty');
  }
  if (endpoint.length > MAX_ENDPOINT_LENGTH) {
    throw new Error('Push endpoint is too long');
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('Push endpoint is not a valid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Push endpoint must be HTTPS');
  }
  return parsed.toString();
}

export function normalizePushKey(raw: string, field: 'p256dh' | 'auth'): string {
  const value = raw.trim();
  if (!value || value.length > MAX_KEY_LENGTH) {
    throw new Error(`Push ${field} is invalid`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Push ${field} is invalid`);
  }
  return value;
}
