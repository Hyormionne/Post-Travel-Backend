# Stage 1: deps & build
FROM node:22-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
ARG DATABASE_URL=postgresql://next:next@host.docker.internal:5432/next
RUN DATABASE_URL=${DATABASE_URL} pnpm prisma:generate && pnpm build

# Stage 2: prod deps only (Prisma Client 산출물은 builder에서 복사)
FROM node:22-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
# `prisma` CLI는 devDependency이므로 prod install에서 빠진다.
# Prisma 7은 `prisma-client` 제너레이터 산출물을 `generated/prisma/`에 떨어뜨리므로,
# 이 산출물을 runtime 스테이지에서 별도로 복사한다.

# Stage 3: runtime
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app && useradd --system --gid app app
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/generated ./generated
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/prisma ./prisma
COPY --chown=app:app package.json ./
USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
