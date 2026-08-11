/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_URL: string;
  /** supabase (default) | local — must match API AUTH_MODE when using local */
  readonly VITE_AUTH_MODE?: 'supabase' | 'local';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
