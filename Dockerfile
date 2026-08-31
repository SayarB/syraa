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
COPY biome.json ./

RUN npm run build -w @everyday/memory \
  && npm run build -w @everyday/context \
  && npm run build -w @everyday/ingest \
  && npm run build -w @everyday/harness \
  && npm run build -w @everyday/api

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV DRIVE_ROOT=/data/drive

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "apps/api/dist/index.js"]
