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
# Prisma can't reap its own schema-engine child here (kill(2) returns
# EACCES in this sandbox), so the child outlives it, keeps the parent's
# event loop alive, and `prisma db push` never exits -- it hangs *after*
# applying the schema and logging success, and it traps SIGTERM into the
# same broken cleanup, so `timeout` can't reliably end it either.
# So don't make the server wait on it: push the schema in the background
# (its actual work takes <1s) and hand PID 1 straight to node, which then
# listens within seconds and gets SIGTERM on shutdown like it should.
CMD ["sh", "-c", "(/app/node_modules/.bin/prisma db push --skip-generate || true) & exec node dist/index.js"]
