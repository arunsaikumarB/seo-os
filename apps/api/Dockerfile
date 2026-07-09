FROM node:20-alpine AS base
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
RUN npm run build --workspace=@seo-os/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV ENABLE_WORKERS=true
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages ./packages
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
