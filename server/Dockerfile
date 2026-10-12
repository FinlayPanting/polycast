# Polycast server: API + preparation worker. Needs ffmpeg for guide audio.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core packages/core
COPY server server
RUN pnpm install --frozen-lockfile --filter @polycast/server...
WORKDIR /app/server
ENV NODE_ENV=production
CMD ["pnpm", "exec", "tsx", "src/main.ts"]
