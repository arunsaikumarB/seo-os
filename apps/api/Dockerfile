FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY workers ./workers
COPY turbo.json tsconfig.base.json ./
RUN npm ci --workspace=@seo-os/api --include-workspace-root

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx turbo run build --filter=@seo-os/api

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV ENABLE_WORKERS=true
# Pin cache path so install + runtime agree (Railway default would be /root/.cache)
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Use full Chromium for headless (not chromium_headless_shell) — avoids missing-shell errors
ENV PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL=0

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/scripts ./apps/api/scripts
COPY --from=build /app/packages ./packages

# Install Chromium + OS deps using the package-local Playwright CLI (matching revision)
RUN node node_modules/playwright/cli.js install --with-deps chromium \
  && PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL=0 node -e "\
const pw=require('playwright'); const fs=require('fs'); \
const p=pw.chromium.executablePath(); \
if(!fs.existsSync(p)){console.error('Chromium missing at',p); process.exit(1);} \
console.log('Chromium OK', p); \
pw.chromium.launch({headless:true,executablePath:p,timeout:60000}).then(b=>b.close()).then(()=>console.log('Launch OK')).catch(e=>{console.error(e); process.exit(1);});"

EXPOSE 3001
CMD ["sh", "-c", "node apps/api/scripts/ensure-playwright-browsers.mjs && node apps/api/dist/index.js"]
