import type { Session, User } from '@supabase/supabase-js';

const STORAGE_KEY = 'ba.local_auth.session';

type StoredLocalSession = {
  access_token: string;
  user: { id: string; email: string; fullName?: string };
  expires_at: number;
};

function decodeJwtExp(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : Math.floor(Date.now() / 1000) + 3600;
  } catch {
    return Math.floor(Date.now() / 1000) + 3600;
  }
}

export function toSessionShape(stored: StoredLocalSession): Session {
  const user = {
    id: stored.user.id,
    email: stored.user.email,
    app_metadata: { provider: 'local' },
    user_metadata: { full_name: stored.user.fullName ?? stored.user.email },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as User;

  return {
    access_token: stored.access_token,
    refresh_token: '',
    expires_in: Math.max(0, stored.expires_at - Math.floor(Date.now() / 1000)),
    expires_at: stored.expires_at,
    token_type: 'bearer',
    user,
  } as Session;
}

export function readLocalSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredLocalSession;
    if (!stored?.access_token || !stored?.user?.id) return null;
    if (stored.expires_at * 1000 < Date.now() + 5_000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return toSessionShape(stored);
  } catch {
    return null;
  }
}

export function writeLocalSession(accessToken: string, user: { id: string; email: string; fullName?: string }): Session {
  const stored: StoredLocalSession = {
    access_token: accessToken,
    user,
    expires_at: decodeJwtExp(accessToken),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return toSessionShape(stored);
}

export function clearLocalSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
