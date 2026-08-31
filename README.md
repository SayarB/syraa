# Everyday

Working repo for the Everyday agent harness (plans + feasibility experiments).

## Layout

```
apps/web/                  # Vite+React chat UI (preferred)
apps/api/                  # API process — serves harness HTTP (+ legacy static UI)
packages/harness/          # @everyday/harness — chat + ingest upload API
packages/memory/           # @everyday/memory — M7 Memory SDK (Drizzle + Postgres)
packages/context/          # @everyday/context — resources / topics / chunks / cards
packages/ingest/           # @everyday/ingest — Redis queue client + local drive paths
services/ingest-worker/    # Python PDF ingest (heading heuristics → Postgres)
scripts/dev/               # dev helpers (python.sh, with-env.sh)
plans/                     # living brainstorm docs
data/drive/                # local MVP blob store (Docker volume `drive_data`)
fixtures/pdfs/, out/       # sample inputs / dumps
```

## Code quality

From repo root (applies to `packages/*`, `apps/*`, and `services/ingest-worker/`):

```bash
npm install                  # workspaces + Biome
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

npm run check                # Biome + tsc + Ruff (lint + format check)
npm run format               # auto-fix
npm run test                 # vitest + pytest
```

CI runs the same checks on push/PR (`.github/workflows/ci.yml`). New TS packages under `packages/*` or `apps/*` are picked up via npm workspaces; see `.cursor/rules/code-quality.mdc`.

### Local stack (chat + PDF ingest)

```bash
cp .env.example .env          # FIREWORKS_API_KEY for chat; optional embed keys
npm install
npm run db:up                 # postgres + redis
npm run db:migrate            # memory + context schemas
npm run dev:api               # harness API → http://localhost:3000
npm run dev:web               # Vite UI → http://localhost:5173 (proxies /api)
npm run dev:ingest            # Python worker (BRPOP Redis jobs)
```

Or all-in-Docker: `npm run dev:up` (postgres, redis, api, ingest-worker; shared `drive_data` volume).

**Upload a file** sits above the chat composer in `apps/web`. Flow: multipart upload → local drive → Redis queue → worker (bookmarks → printed TOC → body heading heuristics) → topics/chunks/card (+ optional text embeddings) → Postgres.

Drive path: `DRIVE_ROOT` (default `data/drive` on host, `/data/drive` in Compose). Not S3.

Chat uses **Fireworks** by default (`FIREWORKS_API_KEY`, `FIREWORKS_MODEL`). Set `CHAT_PROVIDER=openai` + `OPENAI_API_KEY` for OpenAI. Pending memory items appear in the brain menu.

Slash commands:

- `/rule Never invent citations`
- `/pref Keep answers concise`
- `/method Always cite page numbers`
- `/decision Use Postgres in Docker`

**Embeddings (text only, optional):** `EMBEDDING_PROVIDER=auto|fireworks|openai|hash|none`. With no API key, chunks still persist with `embedding = null`. No vision / VLM path.

Stop stack: `npm run dev:down`

**TypeScript** for app SDKs and harness. **Python only** for `services/ingest-worker/` (PDF ingest / heading heuristics).

## Structure extract (algorithmic only)

| Script | Method |
|---|---|
| `algo_outline` / `structure` | Bookmarks → printed TOC → font/number heuristics (**no LLM / VLM**) |

```bash
cd /Volumes/ssd/code/everyday
source .venv/bin/activate

python -m everyday_ingest.heading_heuristics.algo_outline test.pdf --force toc
python -m everyday_ingest.heading_heuristics.cli test.pdf --source toc
```

## PDF ingest → topics + chunks JSON

Materializes the leveled context model from a resolved outline:

- `topics[]` — tree spine (`id`, `parent_id`, `path`, page range)
- `chunks[]` — `bridge` (summary → `child_topic_id`) and `leaf` (full section text)
- `card` — cheap outline projection
- `tree` — nested outline

```bash
python -m everyday_ingest.cli test.pdf --pretty -o out/test-ingest.json
python -m everyday_ingest.cli test.pdf --source toc -o out/test-ingest-toc.json
```

Bridge text is a cheap title+lead excerpt (no LLM). Queue-backed worker also writes Postgres and optional text embeddings.

### Queue job payload

Redis list `everyday:ingest:queue` (LPUSH / BRPOP). Status hash `everyday:ingest:job:{jobId}`.

```json
{
  "jobId": "uuid",
  "userId": "demo-user",
  "resourceId": "uuid",
  "driveKey": "demo-user/uploads/<resourceId>/file.pdf",
  "filePath": "/absolute/path/to/file.pdf",
  "mime": "application/pdf",
  "name": "file.pdf"
}
```

API: `POST /api/ingest/upload` (multipart `file` + optional `userId`), `GET /api/ingest/jobs/:jobId`.

## Tests

```bash
npm run test                 # TS + Python
# or separately:
npm run test:ts
npm run test:py
```

Python ingest tests cover heuristics/TOC rules, structure on synthetic PDFs, ingest bridge/leaf invariants, and queue/embed helpers. Repo-root `test.pdf` tests run when that file is present.
