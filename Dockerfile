FROM node:22-alpine

RUN apk add --no-cache bash

WORKDIR /app

# Workspace install (root + packages/* + apps/*)
COPY package.json package-lock.json ./
COPY packages/memory/package.json packages/memory/
COPY packages/context/package.json packages/context/
COPY packages/ingest/package.json packages/ingest/
COPY packages/harness/package.json packages/harness/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY packages/memory packages/memory
COPY packages/context packages/context
COPY packages/ingest packages/ingest
COPY packages/harness packages/harness
COPY apps/api apps/api
COPY apps/web apps/web
COPY biome.json ./

# Empty VITE_API_BASE → browser calls same-origin /api
ENV VITE_API_BASE=

RUN npm run build -w @syraa/memory \
  && npm run build -w @syraa/context \
  && npm run build -w @syraa/ingest \
  && npm run build -w @syraa/harness \
  && npm run build -w @syraa/api \
  && npm run build -w @syraa/web

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV DRIVE_ROOT=/data/drive
ENV STATIC_DIR=/app/apps/web/dist

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "apps/api/dist/index.js"]
