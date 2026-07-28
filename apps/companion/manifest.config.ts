import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'SEO OS Companion',
  version: '0.2.3',
  description:
    'Phase 2.1 — in-memory handoff only. No storage. Fetches packages from SEO OS. Never submits.',
  icons: {
    '16': 'public/icons/icon-16.png',
    '32': 'public/icons/icon-32.png',
    '48': 'public/icons/icon-48.png',
    '128': 'public/icons/icon-128.png',
  },
  action: {
    default_title: 'SEO OS Companion',
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'public/icons/icon-16.png',
      '32': 'public/icons/icon-32.png',
      '48': 'public/icons/icon-48.png',
    },
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  permissions: ['storage', 'activeTab'],
  host_permissions: ['http://*/*', 'https://*/*'],
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/main.tsx'],
      run_at: 'document_idle',
    },
  ],
});
