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
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages ./packages

# Railway / container: install Chromium + OS deps; validate executable before start
RUN npx playwright install --with-deps chromium \
  && node -e "const pw=require('playwright'); const fs=require('fs'); const p=pw.chromium.executablePath(); if(!fs.existsSync(p)){console.error('Chromium missing at',p); process.exit(1);} console.log('Chromium OK', p);"

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
