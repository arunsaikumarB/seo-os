import { describe, expect, it } from 'vitest';
import { encryptJson, decryptJson } from '../src/crypto.js';

describe('integration credential crypto', () => {
  it('round-trips JSON secrets', () => {
    const original = { accessToken: 'tok_abc', refreshToken: 'ref_xyz' };
    const enc = encryptJson(original, 'test-encryption-key-32chars!!');
    expect(enc.ciphertext).toBeTruthy();
    expect(enc.iv).toBeTruthy();
    expect(enc.authTag).toBeTruthy();
    const decoded = decryptJson(enc, 'test-encryption-key-32chars!!');
    expect(decoded).toEqual(original);
  });

  it('fails with wrong key', () => {
    const enc = encryptJson({ a: 1 }, 'key-one');
    expect(() => decryptJson(enc, 'key-two')).toThrow();
  });
});
