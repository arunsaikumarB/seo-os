FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/providers/package.json ./packages/providers/
RUN npm ci --workspace=@seo-os/api --include-workspace-root

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=@seo-os/shared
RUN npm run build --workspace=@seo-os/providers
RUN npm run build --workspace=@seo-os/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/providers/dist ./packages/providers/dist
COPY --from=build /app/packages/providers/package.json ./packages/providers/
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
