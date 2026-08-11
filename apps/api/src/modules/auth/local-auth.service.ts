import { randomUUID, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { AppError } from '@seo-os/shared';
import { getEnv } from '../../config/env.js';
import { pgQuery } from '../../lib/pg.js';

export const LOCAL_JWT_ISSUER = 'backlink-agent-local';
export const LOCAL_JWT_AUDIENCE = 'authenticated';

const SCRYPT_KEYLEN = 64;

function getLocalJwtSecret(): Uint8Array {
  const env = getEnv();
  const secret = env.LOCAL_JWT_SECRET || env.SUPABASE_JWT_SECRET;
  return new TextEncoder().encode(secret);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const next = scryptSync(password, salt, SCRYPT_KEYLEN);
  const prev = Buffer.from(hash, 'hex');
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

export async function signLocalAccessToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(LOCAL_JWT_ISSUER)
    .setAudience(LOCAL_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getLocalJwtSecret());
}

export async function verifyLocalAccessToken(token: string): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, getLocalJwtSecret(), {
    issuer: LOCAL_JWT_ISSUER,
    audience: LOCAL_JWT_AUDIENCE,
  });
  if (!payload.sub) throw new Error('Missing sub');
  return { sub: payload.sub };
}

type LocalUserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
};

async function ensureAuthUserStub(userId: string, email: string, fullName: string): Promise<void> {
  // Minimal auth.users row so profiles FK + handle_new_user trigger keep working.
  await pgQuery(
    `INSERT INTO auth.users (
       id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at, is_sso_user, is_anonymous
     ) VALUES (
       $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, $3,
       now(), '{"provider":"local","providers":["local"]}'::jsonb, $4::jsonb,
       now(), now(), false, false
     )
     ON CONFLICT (id) DO NOTHING`,
    [
      userId,
      email,
      hashPassword(randomBytes(16).toString('hex')),
      JSON.stringify({ full_name: fullName }),
    ]
  );
}

export async function localSignUp(input: {
  email: string;
  password: string;
  fullName: string;
}): Promise<{ accessToken: string; user: { id: string; email: string; fullName: string } }> {
  const email = input.email.trim().toLowerCase();
  if (input.password.length < 8) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at least 8 characters');
  }

  const existing = await pgQuery<{ id: string }>(
    `SELECT id FROM public.local_auth_users WHERE lower(email) = $1 LIMIT 1`,
    [email]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    throw new AppError(409, 'AUTH_EMAIL_TAKEN', 'An account with this email already exists');
  }

  const userId = randomUUID();
  const passwordHash = hashPassword(input.password);
  const fullName = input.fullName.trim() || email;

  await ensureAuthUserStub(userId, email, fullName);

  // Profile may already exist via trigger; ensure row anyway
  await pgQuery(
    `INSERT INTO public.profiles (id, full_name)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name)`,
    [userId, fullName]
  );

  await pgQuery(
    `INSERT INTO public.local_auth_users (id, email, password_hash, full_name)
     VALUES ($1, $2, $3, $4)`,
    [userId, email, passwordHash, fullName]
  );

  const accessToken = await signLocalAccessToken(userId, email);
  return { accessToken, user: { id: userId, email, fullName } };
}

export async function localSignIn(input: {
  email: string;
  password: string;
}): Promise<{ accessToken: string; user: { id: string; email: string; fullName: string } }> {
  const email = input.email.trim().toLowerCase();
  const result = await pgQuery<LocalUserRow>(
    `SELECT id, email, password_hash, full_name
     FROM public.local_auth_users
     WHERE lower(email) = $1
     LIMIT 1`,
    [email]
  );
  const row = result.rows[0];
  if (!row || !verifyPassword(input.password, row.password_hash)) {
    throw new AppError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid email or password');
  }
  const fullName = row.full_name ?? row.email;
  const accessToken = await signLocalAccessToken(row.id, row.email);
  return { accessToken, user: { id: row.id, email: row.email, fullName } };
}
