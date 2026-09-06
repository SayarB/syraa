# Plan: One core, many fronts (app continuum)

**Status:** draft — ready to implement Phase A when green-lit  
**Related:** [`mastra-first.md`](./mastra-first.md), [`harness.md`](./harness.md)  
**Out of scope:** Messaging (Telegram/Slack/etc.) — separate product concern later

---

## Product boundary (locked)

| Surface class | Thread model | This plan |
|---|---|---|
| **Apps** — web, desktop, later mobile | **Same** Mastra threads per authenticated `userId` (`resource`) + shared `@syraa/memory` / materials | **In scope** |
| **Messaging** — Telegram/etc. | Different channel product; may never share app threads | **Out of scope** |

Desktop is not a second agent. It is another **client** of the same hosted harness API. “Pick up where web left off” = same account → same thread list / history from the server.

```text
  Web ──┐
Desktop─┼──► HTTP adapter ──► Turn core ──► Mastra threads (resource = userId)
Mobile ─┘                      │
                               ├── @syraa/memory
                               └── @syraa/context
```

Mastra already keys threads by `resource: userId` in `packages/harness/src/threads.ts` and `mastra/chat-stream.ts`. Continuity across devices is mostly **identity + API shape**, not a new loop.

---

## Current gap

The “core” is half-coupled to HTTP:

| Piece | Today | Problem |
|---|---|---|
| `handleChat` | JSON in/out | Mostly clean |
| `pipeChatStream(request, res)` | Takes Node `ServerResponse` | HTTP inside core |
| `createHarnessServer` | HTTP + static + all APIs | Fine as adapter, but stream piping lives in `chat.ts` |
| Web client | `demo-user` + `localStorage` last-thread | One-browser UX; not enough for desktop pickup |

---

## Target shape

### 1. Turn core (harness, transport-free)

Never import `node:http` in the turn core:

| API | Role |
|---|---|
| `prepareChatTurn(request)` | Thread ensure, `/help`, `/rule`…, memory pack |
| Non-stream path | → `{ message, lessons, threadId, … }` (today’s `handleChat` body) |
| `createChatTurnStream(...)` | Returns AI SDK UI message stream + turn-complete side effects — **no** `ServerResponse` |
| `handleChat` / `pipeChatStream` | Thin HTTP wrappers (or live next to server adapter only) |

Keep inside core: Mastra `agent.stream` / `generate`, lessons apply, materials WM seed, `ChatRunContext`.

### 2. HTTP as the first adapter (not the core)

`packages/harness/src/server.ts` (or `http/chat-adapter.ts`) owns:

- Parse body / auth → `ChatRequest`
- Call core
- `pipeUIMessageStreamToResponse({ response, stream })`
- REST for threads / memory / ingest (all apps need these)

### 3. Shared app continuum contract

| Concern | Rule |
|---|---|
| Threads | Server SoT via `GET /api/threads` + get-by-id; no client-owned transcript |
| Last-open thread | Client-local **resume hint** only; if missing, use server list |
| Chat | `POST /api/chat/stream` (primary) / `POST /api/chat` |
| Memory / materials | Same existing APIs |
| Identity | Stable authenticated `userId` on every request |

**Identity is the real prerequisite for desktop pickup.** Until auth exists, two clients only share threads if they use the same demo id against one API host (local spike only).

### 4. Desktop / mobile (later — not harness forks)

- Prefer shared UI (`apps/web` or future `packages/ui-chat`) against the hosted API
- Shell = windowing / OS / deep links — **not** a second Mastra runtime
- Offline/local agent mode is a **separate** product decision

### 5. Messaging (explicit non-goal)

No Telegram adapters, platform-scoped threads, or gateway in this plan.

---

## Phases

### Phase A — Extract turn core (no new clients)

1. Core returns a stream; move `pipeUIMessageStreamToResponse` into the HTTP adapter.
2. Keep `handleChat` / `pipeChatStream` as wrappers so `apps/api` and tests stay green.
3. Harness tests: static `/help` + stream factory without constructing an HTTP server.

### Phase B — App continuum readiness

1. Keep this doc as the contract: apps share threads via `userId` + thread APIs.
2. Confirm thread list/get/create APIs are enough for a second client (they largely are).
3. Treat `localStorage` thread id as resume hint only in UX/docs.
4. Minimal auth: adapter resolves stable `userId` from session/token (replace query-param `demo-user` for real cross-client continuity). Stack chosen at build time; harness still receives `userId` after resolution.

### Phase C — Desktop shell (product green-light later)

1. Same API + auth as web.
2. Reuse chat UI; verify: chat on web → appears in desktop thread list → resume mid-thread.
3. Do not embed `@syraa/harness` agent runtime in the desktop binary for the continuum path.

---

## Non-goals

- Messaging gateway / platform thread isolation
- Second agent loop in desktop
- Full IAM / SSO (only enough identity for shared threads)
- Changing Mastra model (`resource = userId` stays)

---

## Success criteria

- Turn core has zero `node:http` / `ServerResponse` imports
- Web behavior unchanged (stream chat, threads, memory, ingest)
- A second client with the same API + same user lists and resumes the same threads with no harness fork
- Messaging remains undesigned and unblocked for a later plan
