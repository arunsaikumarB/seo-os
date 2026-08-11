import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** DD3 / company: `.env` at ba-frontend repo root. Local monorepo: `apps/web/.env*`. */
function resolveEnvDir(mode: string, webDir: string, repoRoot: string): string {
  const candidates = [
    '.env',
    '.env.local',
    `.env.${mode}`,
    `.env.${mode}.local`,
  ];
  const hasEnv = (dir: string) => candidates.some((f) => existsSync(path.join(dir, f)));

  // Prefer repo-root when present (company / DD3). Else apps/web (local demo).
  if (hasEnv(repoRoot)) return repoRoot;
  if (hasEnv(webDir)) return webDir;
  return repoRoot;
}

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
        `  Company/DD3: put VITE_* in repo-root .env and .env.production\n` +
        `  Example: VITE_API_URL=https://your-api-host\n` +
        `  Build from ba-frontend root: npm run build`
    );
  }

  const isLocal =
    normalized.includes('localhost') || normalized.includes('127.0.0.1');
  if (isLocal && !allowLocalhost) {
    throw new Error(
      `[vite] Refusing production build: VITE_API_URL is localhost.\n` +
        `  Current: ${apiUrl}\n` +
        `  Company/DD3: set VITE_AUTH_MODE=local and VITE_API_URL in repo-root .env\n` +
        `  Or set VITE_ALLOW_LOCALHOST_API=true for an internal localhost API.`
    );
  }

  if (normalized.includes('supabase.co') || normalized.includes('supabase.in')) {
    throw new Error(
      `[vite] Refusing production build: VITE_API_URL points at Supabase.\n` +
        `  Use your Backlink Agent API URL, not Supabase.`
    );
  }
}

export default defineConfig(({ mode }) => {
  const webDir = __dirname;
  const repoRoot = path.resolve(__dirname, '../..');
  const envDir = resolveEnvDir(mode, webDir, repoRoot);
  const env = loadEnv(mode, envDir, '');
  const apiUrl = env.VITE_API_URL || 'http://localhost:3001';
  assertProductionApiUrl(apiUrl, mode, env);

  return {
    envDir,
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
