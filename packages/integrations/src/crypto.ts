import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(
  plaintext: string,
  encryptionKey?: string
): { ciphertext: string; iv: string; authTag: string; keyVersion: number } {
  const secret = encryptionKey || process.env.ENCRYPTION_KEY;
  if (!secret && (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging')) {
    throw new Error('ENCRYPTION_KEY is required to store integration credentials in production');
  }
  const key = deriveKey(secret || 'seo-os-dev-integrations-key');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion: 1,
  };
}

export function decryptSecret(
  payload: { ciphertext: string; iv: string; authTag?: string | null },
  encryptionKey?: string
): string {
  const secret = encryptionKey || process.env.ENCRYPTION_KEY;
  if (!secret && (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging')) {
    throw new Error('ENCRYPTION_KEY is required to read integration credentials in production');
  }
  const key = deriveKey(secret || 'seo-os-dev-integrations-key');
  const decipher = createDecipheriv(ALGO, key, Buffer.from(payload.iv, 'base64'));
  if (payload.authTag) {
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  }
  const dec = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

export function encryptJson(value: Record<string, unknown>, encryptionKey?: string) {
  return encryptSecret(JSON.stringify(value), encryptionKey);
}

export function decryptJson(
  payload: { ciphertext: string; iv: string; authTag?: string | null },
  encryptionKey?: string
): Record<string, unknown> {
  const raw = decryptSecret(payload, encryptionKey);
  return JSON.parse(raw) as Record<string, unknown>;
}
