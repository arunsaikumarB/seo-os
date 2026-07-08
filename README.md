# SEO OS

**The AI Workforce for SEO Teams** — Enterprise modular SaaS for AI-powered SEO.

Sprint 0 delivers the **foundation only**: monorepo, API shell, web shell, shared packages, Supabase migrations 001–003, CI/CD, and local development tooling.

## Quick Start

```bash
npm install
cp .env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
supabase start && npm run db:push   # optional
npm run verify:local                # lint + format + typecheck + build + health
npm run dev
```

| Service | URL                          |
| ------- | ---------------------------- |
| Web     | http://localhost:5173        |
| API     | http://localhost:3001/health |

## Documentation

| Guide                                                                              | Description                 |
| ---------------------------------------------------------------------------------- | --------------------------- |
| [Local Setup](./docs/local-setup.md)                                               | Development workflow        |
| [Deployment](./docs/deployment.md)                                                 | Staging & production deploy |
| [Environment](./docs/environment.md)                                               | All env variables           |
| [Architecture](./docs/architecture.md)                                             | System overview             |
| [Troubleshooting](./docs/troubleshooting.md)                                       | Common issues               |
| [Sprint 0 Validation](./docs/sprint-0/SPRINT_0_VALIDATION.md)                      | Latest review score         |
| [Architecture Freeze](./docs/architecture-freeze/00-FREEZE_INDEX_AND_READINESS.md) | Frozen specs v1.1.0         |

## Scripts

| Command                 | Description                |
| ----------------------- | -------------------------- |
| `npm run dev`           | Start web + API            |
| `npm run build`         | Build all packages         |
| `npm run lint`          | ESLint (zero warnings)     |
| `npm run format:check`  | Prettier check             |
| `npm run typecheck`     | TypeScript check           |
| `npm run verify:local`  | Full Sprint 0 verification |
| `npm run smoke:staging` | Staging `/health` smoke    |

## Stack

React 18 · Vite · Tailwind · Express · Supabase · pg-boss · Turborepo · Pino · Zod · ESLint · Prettier

## License

Private — all rights reserved.
