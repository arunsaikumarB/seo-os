# SEO OS API — Playwright/Chromium must be launchable in production.
# Build deps on Node; run on the official Playwright image so Chromium + OS libs match.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY workers ./workers
COPY turbo.json tsconfig.base.json ./
RUN npm ci --workspace=@seo-os/api --include-workspace-root

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx turbo run build --filter=@seo-os/api

# Pin to the same major.minor as apps/api playwright (^1.49.1 → 1.49.1)
FROM mcr.microsoft.com/playwright:v1.49.1-jammy AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV ENABLE_WORKERS=true
# Official image browsers live here — must match runtime resolution
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/scripts ./apps/api/scripts
COPY --from=build /app/packages ./packages

# Reconcile browsers for the workspace-hoisted Playwright revision (idempotent on image)
RUN node apps/api/scripts/ensure-playwright-browsers.mjs \
  && node -e "\
const pw=require('playwright'); const fs=require('fs'); \
const path=process.env.PLAYWRIGHT_BROWSERS_PATH; \
console.log('PLAYWRIGHT_BROWSERS_PATH=', path); \
const p=pw.chromium.executablePath(); \
if(!fs.existsSync(p)){console.error('Chromium missing at',p); process.exit(1);} \
console.log('Chromium OK', p); \
pw.chromium.launch({headless:true,executablePath:p,args:['--no-sandbox','--disable-dev-shm-usage'],timeout:60000})\
  .then(b=>b.close()).then(()=>console.log('Launch OK')).catch(e=>{console.error('Launch FAIL',e); process.exit(1);});"

EXPOSE 3001
CMD ["sh", "-c", "node apps/api/scripts/ensure-playwright-browsers.mjs && node apps/api/dist/index.js"]
