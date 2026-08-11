/** Web auth cutover flag. Default supabase — matches current demos. */
export type WebAuthMode = 'supabase' | 'local';

export function getWebAuthMode(): WebAuthMode {
  const raw = String(import.meta.env.VITE_AUTH_MODE ?? 'supabase').toLowerCase();
  return raw === 'local' ? 'local' : 'supabase';
}

export function isLocalAuthMode(): boolean {
  return getWebAuthMode() === 'local';
}
