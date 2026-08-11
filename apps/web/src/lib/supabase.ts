import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isLocalAuthMode } from '@/lib/auth-mode';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const configured = Boolean(url && anonKey);

if (!configured && !isLocalAuthMode()) {
  console.warn('Supabase env vars missing — auth disabled until configured');
}

/**
 * Browser Supabase client.
 * In VITE_AUTH_MODE=local (company stack) this is unused for login; realtime hooks no-op.
 */
export const supabase: SupabaseClient = createClient(
  url || 'http://127.0.0.1:0',
  anonKey || 'company-stack-unused',
  {
    auth: {
      persistSession: !isLocalAuthMode(),
      autoRefreshToken: !isLocalAuthMode(),
    },
  }
);

export function isSupabaseBrowserConfigured(): boolean {
  return configured && !isLocalAuthMode();
}
