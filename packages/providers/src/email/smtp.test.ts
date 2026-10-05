import { afterEach, describe, expect, it } from 'vitest';
import { smtpConfigFromEnv } from './smtp.js';

const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const;
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('smtpConfigFromEnv', () => {
  it('returns null when the host is missing and treats 465 as secure', () => {
    delete process.env.SMTP_HOST;
    process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'me@gmail.com';
    process.env.SMTP_PASS = 'app-password';
    delete process.env.SMTP_FROM;
    delete process.env.SMTP_SECURE;
    expect(smtpConfigFromEnv()).toBeNull();

    process.env.SMTP_HOST = 'smtp.gmail.com';
    expect(smtpConfigFromEnv()).toEqual({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      user: 'me@gmail.com',
      pass: 'app-password',
      from: 'me@gmail.com',
    });

    process.env.SMTP_SECURE = 'false';
    process.env.SMTP_FROM = 'alias@gmail.com';
    expect(smtpConfigFromEnv()).toMatchObject({ secure: false, from: 'alias@gmail.com' });
  });
});
