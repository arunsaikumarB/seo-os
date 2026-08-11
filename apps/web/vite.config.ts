import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

function assertProductionApiUrl(
  apiUrl: string,
  mode: string,
  env: Record<string, string>
) {
  if (mode !== 'production') return;

  const normalized = apiUrl.replace(/\/$/, '');
  const authMode = String(env.VITE_AUTH_MODE ?? 'supabase').toLowerCase();
  const allowLocalhost =
    authMode === 'local' || env.VITE_ALLOW_LOCALHOST_API === 'true';

  if (!normalized) {
    throw new Error(
      `[vite] Refusing production build: VITE_API_URL is empty.\n` +
        `  Fix (company stack): set VITE_API_URL in apps/web/.env or apps/web/.env.production\n` +
        `  Example: VITE_API_URL=https://your-api-host\n` +
        `  Then run \`npm run build\` from the repo root (ba-frontend).`
    );
  }

  const isLocal =
    normalized.includes('localhost') || normalized.includes('127.0.0.1');
  if (isLocal && !allowLocalhost) {
    throw new Error(
      `[vite] Refusing production build: VITE_API_URL is localhost.\n` +
        `  Current: ${apiUrl}\n` +
        `  Company stack: set VITE_AUTH_MODE=local and VITE_API_URL to your API URL\n` +
        `    in apps/web/.env (and apps/web/.env.production if you use one).\n` +
        `  Or set VITE_ALLOW_LOCALHOST_API=true for an internal localhost API.\n` +
        `  Build from repo root: npm run build`
    );
  }

  if (normalized.includes('supabase.co') || normalized.includes('supabase.in')) {
    throw new Error(
      `[vite] Refusing production build: VITE_API_URL points at Supabase.\n` +
        `  Use your Backlink Agent API URL (company host or Railway), not Supabase.`
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
