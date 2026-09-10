# Single image serving both the API and the built frontend (same origin,
# no CORS needed in production). Built by .github/workflows/docker-publish.yml
# and pulled by the deployment -- see README.md "Deployment".

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Prisma's query/schema engine binaries need libssl; bookworm-slim doesn't
# ship it, which breaks engine detection (silently defaults to the wrong
# build) both when generating the client here and when running it below.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY . .
RUN npm run db:generate --workspace backend
RUN npm run build --workspace backend
RUN npm run build --workspace frontend

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=8080
ENV FRONTEND_DIST_PATH=/app/frontend-dist

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/frontend/dist ./frontend-dist

EXPOSE 8080
WORKDIR /app/backend
# This container runs without CAP_KILL, so Prisma's EACCES when reaping its
# own schema-engine child isn't just noisy -- the child survives, keeps the
# parent's event loop alive, and `prisma db push` never exits at all (it
# hangs *after* applying the schema and logging success). Unbounded, that
# means the server is never reached and nothing ever listens on $PORT.
# `timeout` bounds the hang; `|| true` covers both its 124 and Prisma's own
# non-zero exit; `exec` hands PID 1 to node so SIGTERM actually stops the
# container instead of being SIGKILLed 10s later.
CMD ["sh", "-c", "timeout 20 /app/node_modules/.bin/prisma db push --skip-generate || true; exec node dist/index.js"]
