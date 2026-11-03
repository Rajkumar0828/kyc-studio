# KYC Studio app image. Build context: the repository root (see .dockerignore).
#   docker build -t kyc-studio-app .
# Multi-stage: dependencies, build (Next.js standalone output), then a slim
# runtime that runs as the unprivileged `node` user. No env files are copied:
# configuration comes from the environment at run time (docker-compose.prod.yml).
ARG NODE_IMAGE=node:24-trixie-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /src
COPY --from=deps /src/frontend/node_modules frontend/node_modules
COPY frontend frontend
# The synthetic specimens are part of the image: mock mode recognises them by
# content and returns each case's scripted outcome (src/lib/ai/specimens.ts
# reads ../eval/specimens relative to the app directory).
COPY eval/specimens eval/specimens
RUN test -f eval/specimens/index.json || (echo "eval/specimens/index.json is missing" && exit 1)
WORKDIR /src/frontend
RUN npm run build
# Runtime tree: /app/frontend is the app (cwd), /app/eval/specimens the specimens.
RUN mkdir -p /out/frontend/.next /out/eval \
 && cp -a .next/standalone/. /out/frontend/ \
 && cp -a .next/static /out/frontend/.next/static \
 && cp -a public /out/frontend/public \
 && cp -a /src/eval/specimens /out/eval/specimens

FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app/frontend
# Code is owned by root and read-only for the app; only data/ (application
# metadata log) and .next/cache are writable by the `node` user.
COPY --from=build /out /app
RUN mkdir -p /app/frontend/data /app/frontend/.next/cache \
 && chown node:node /app/frontend/data /app/frontend/.next/cache \
 # No env files may reach the image (secrets come from the environment at run time).
 && if find /app -name '.env*' | grep -q .; then echo "env files found in the image:"; find /app -name '.env*'; exit 1; fi
USER node
# Prove sharp (the quality gate) loads and works in the runtime image.
RUN node -e "require('sharp')({ create: { width: 8, height: 8, channels: 3, background: '#808080' } }).png().toBuffer().then((b) => console.log('sharp ok', b.length, 'bytes'), (e) => { console.error(e); process.exit(1); })"
EXPOSE 3000
# Liveness only: /api/health/live never touches MongoDB or Vault, so a
# configuration warning (see /api/health) cannot mark the container unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
