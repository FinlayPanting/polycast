# Polycast server: API + preparation worker. Needs ffmpeg for guide audio.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
# pnpm reads every patch named in package.json's patchedDependencies, even for packages it won't install here.
COPY patches patches
COPY packages/core packages/core
COPY server server
RUN pnpm install --frozen-lockfile --filter @polycast/server...
WORKDIR /app/server
ENV NODE_ENV=production
# Node itself runs as the main process, so it receives Railway's SIGTERM and can hand back an
# unfinished job (pnpm exec would swallow the signal).
CMD ["node", "--import", "tsx", "src/main.ts"]
