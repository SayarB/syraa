# Syraa

Local agent harness: chat + durable memory + PDF context ingest (topic tree).

## Layout

```
apps/web/                  # Vite + React UI
apps/api/                  # HTTP process → @syraa/harness
packages/harness/          # Chat, memory wiring, ingest upload API
packages/memory/           # Preferences / rules / methods / decisions (Postgres)
packages/context/          # Resources / topics / chunks / cards
packages/ingest/           # Redis queue client + local drive paths
services/ingest-worker/    # Python PDF ingest (heuristics → Postgres)
scripts/dev/               # Local helpers (env + Python)
plans/                     # Product brainstorm notes
.plans/                    # Agent delivery phase plans (gitignored)
data/drive/                # Local PDF blob store
```

## Run with Docker

```bash
cp .env.example .env
# Required for sign-in + chat:
#   BETTER_AUTH_SECRET=$(openssl rand -base64 32)
#   BETTER_AUTH_URL=http://localhost:3000
#   FIREWORKS_API_KEY=...
npm run dev:up             # postgres + redis + api (serves UI) + ingest-worker
```

Open **http://localhost:3000** — React UI is baked into the API image (`apps/web/dist`).

Stop: `npm run dev:down`

## Deploy (VPS / Dokploy)

Use the repo root [`compose.yaml`](compose.yaml) (or Dokploy “Docker Compose” with the same file).

1. Set secrets in Dokploy / `.env` (do **not** use the sample DB password on a public host):
   - `POSTGRES_PASSWORD` — strong password
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
   - `BETTER_AUTH_URL` — public HTTPS origin, e.g. `https://syraa.example.com` (no trailing slash)
   - `FIREWORKS_API_KEY` (or `CHAT_PROVIDER=openai` + `OPENAI_API_KEY`)
2. Point the domain / Traefik to the **api** service on port **3000** (UI is same-origin).
3. Leave Postgres and Redis on the internal compose network (host ports bind to `127.0.0.1` by default).
4. First boot runs memory, context, and Better Auth migrations via [`docker/entrypoint.sh`](docker/entrypoint.sh).

Smoke after deploy: open the domain → sign up → one chat turn → upload a PDF → sign out. Health: `GET /api/health`.

## Run locally (hot reload)

```bash
npm install && npm run db:up && npm run db:migrate
npm run dev:api               # :3000
npm run dev:web               # :5173 proxies /api
npm run dev:ingest
```

For hot-reload UI work, use the host commands above instead of Compose.

Upload PDFs from the web composer. Flow: drive → Redis → worker (bookmarks → printed TOC → heading heuristics) → topics/chunks → Postgres. Bridge text is title + lead excerpt (no LLM). Embeddings optional via `EMBEDDING_PROVIDER`.

## Quality

```bash
npm run check                 # Biome + tsc + Ruff
npm run test                  # Vitest (packages) + pytest (ingest-worker)
```

Tests live next to code:

- `packages/*/tests/` — Vitest
- `services/ingest-worker/tests/` — pytest (synthetic PDFs in `conftest.py`)

## API surface

- `POST /api/chat`
- `GET|PATCH /api/memory…`
- `POST /api/ingest/upload`, `GET /api/ingest/jobs/:id`
- `GET /api/resources`, `GET /api/resources/:id/tree`
- `GET|POST /api/auth/*` (Better Auth)
- `GET /api/me`
