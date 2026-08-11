import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

function assertProductionApiUrl(apiUrl: string, mode: string, env: Record<string, string>) {
  if (mode !== 'production') return;
  const normalized = apiUrl.replace(/\/$/, '');
  const allowLocalhost =
    env.VITE_ALLOW_LOCALHOST_API === 'true' || env.VITE_AUTH_MODE === 'local';

  if (!normalized) {
    throw new Error(
      `[vite] Refusing production build: VITE_API_URL is empty.\n` +
        `  Fix: set VITE_API_URL in apps/web/.env or apps/web/.env.production to your public API URL,\n` +
        `  then rebuild from the repo root: npm run build`
    );
  }

  const isLoopback =
    normalized.includes('localhost') || normalized.includes('127.0.0.1');
  if (isLoopback && !allowLocalhost) {
    throw new Error(
      `[vite] Refusing production build: VITE_API_URL must be your public API URL, not localhost.\n` +
        `  Current: ${apiUrl}\n` +
        `  Company stack: set VITE_API_URL=https://<your-api-host> in apps/web/.env\n` +
        `  (or apps/web/.env.production), then: npm run build\n` +
        `  Internal-only exception: VITE_AUTH_MODE=local also allows localhost for smoke builds.`
    );
  }

  if (normalized.includes('supabase.co') || normalized.includes('supabase.in')) {
    throw new Error(
      `[vite] Refusing production build: VITE_API_URL points at Supabase. Use your API host URL.`
    );
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const apiUrl = env.VITE_API_URL || 'http://localhost:3001';
  assertProductionApiUrl(apiUrl, mode, env);

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
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-query': ['@tanstack/react-query'],
            'vendor-motion': ['framer-motion'],
            'vendor-charts': ['recharts'],
          },
        },
      },
      chunkSizeWarningLimit: 700,
    },
  };
});
