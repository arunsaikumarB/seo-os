import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

function assertProductionApiUrl(apiUrl: string, mode: string) {
  if (mode !== 'production') return;
  const normalized = apiUrl.replace(/\/$/, '');
  if (!normalized || normalized.includes('localhost') || normalized.includes('127.0.0.1')) {
    throw new Error(
      `[vite] Refusing production build: VITE_API_URL must be your Railway API URL, not localhost.\n` +
        `  Current: ${apiUrl || '(empty)'}\n` +
        `  Fix: set VITE_API_URL in apps/web/.env.production or Netlify env vars, then rebuild.`
    );
  }
  if (normalized.includes('supabase.co') || normalized.includes('supabase.in')) {
    throw new Error(
      `[vite] Refusing production build: VITE_API_URL points at Supabase. Use the Railway API URL.`
    );
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const apiUrl = env.VITE_API_URL || 'http://localhost:3001';
  assertProductionApiUrl(apiUrl, mode);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
  };
});
