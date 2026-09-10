# Single image serving both the API and the built frontend (same origin,
# no CORS needed in production). Built by .github/workflows/docker-publish.yml
# and pulled by the deployment -- see README.md "Deployment".

FROM node:22-bookworm-slim AS build
WORKDIR /app

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
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
