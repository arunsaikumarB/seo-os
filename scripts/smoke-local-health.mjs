/**
 * Local API /health smoke test (requires prior build).
 */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const API_PORT = Number(process.env.SMOKE_API_PORT ?? 3099);

async function waitForHealth(url, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await delay(500);
  }
  return false;
}

function stopProcess(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

const apiEnv = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.test',
  SUPABASE_SERVICE_ROLE_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1zZXJ2aWNlIn0.test',
  SUPABASE_JWT_SECRET: 'local-dev-jwt-secret-at-least-32-chars',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
  CORS_ORIGIN: 'http://localhost:5173',
  ENABLE_WORKERS: 'false',
  PROVIDER_MODE: 'mvp',
};

const api = spawn('node', ['apps/api/dist/index.js'], { env: apiEnv, stdio: 'pipe' });

let logs = '';
api.stderr?.on('data', (d) => {
  logs += d.toString();
});
api.stdout?.on('data', (d) => {
  logs += d.toString();
});

const healthy = await waitForHealth(`http://127.0.0.1:${API_PORT}/health`);
stopProcess(api);
await delay(500);

if (!healthy) {
  console.error('Local /health smoke failed.\n', logs);
  process.exit(1);
}

console.log(`✓ GET http://127.0.0.1:${API_PORT}/health returned 200`);
