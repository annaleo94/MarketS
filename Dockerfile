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
# `|| true`: in some container sandboxes Prisma's schema-engine throws an
# EACCES trying to kill its own already-finished child process during
# cleanup -- cosmetic (the push itself already succeeded and logged so by
# that point), but left unhandled it makes `prisma db push` exit non-zero
# and `&&` would then skip starting the server entirely.
CMD ["sh", "-c", "npx prisma db push --skip-generate || true; node dist/index.js"]
