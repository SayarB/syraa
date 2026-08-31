import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { BrainButton } from "./components/BrainButton";
import { MemoryDropdown } from "./components/MemoryDropdown";
import { MessageList } from "./components/MessageList";
import { TopicTreeModal } from "./components/TopicTreeModal";
import { apiUrl } from "./lib/api";
import type {
  ChatConfig,
  ChatResponse,
  ChatThread,
  ContextResource,
  DisplayMessage,
  IngestJobStatus,
  MemoryItem,
  MemorySnapshot,
  ResourceTopicTree,
  ThreadMessage,
  UploadIngestResponse,
} from "./lib/types";

function nextId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function threadStorageKey(userId: string): string {
  return `syraa:threadId:${userId}`;
}

function loadStoredThreadId(userId: string): string | null {
  try {
    return localStorage.getItem(threadStorageKey(userId));
  } catch {
    return null;
  }
}

function storeThreadId(userId: string, threadId: string | null): void {
  try {
    if (threadId) localStorage.setItem(threadStorageKey(userId), threadId);
    else localStorage.removeItem(threadStorageKey(userId));
  } catch {
    // ignore quota / private mode
  }
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function toDisplayMessages(messages: ThreadMessage[]): DisplayMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
  }));
}

export default function App() {
  const [userId, setUserId] = useState("demo-user");
  const [userDraft, setUserDraft] = useState("demo-user");
  const [subtitle, setSubtitle] = useState("SYRAA AI Chat");
  const [chatReady, setChatReady] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(() => loadStoredThreadId("demo-user"));
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [memoryMeta, setMemoryMeta] = useState("—");
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [resources, setResources] = useState<ContextResource[]>([]);
  const [treeOpen, setTreeOpen] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<ResourceTopicTree | null>(null);
  const memoryAnchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formId = useId();

  const pendingCount = items.filter((item) => item.status === "pending").length;
  const hasThread = messages.some((m) => m.role === "user" || m.role === "assistant");

  async function refreshMemory(activeUser = userId) {
    try {
      const res = await fetch(apiUrl(`/api/memory?userId=${encodeURIComponent(activeUser)}`));
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as MemorySnapshot;
      setItems(data.items);
      const pending = data.items.filter((item) => item.status === "pending").length;
      setMemoryMeta(
        `${data.memory.id.slice(0, 8)}… · ${data.items.length} item(s)${pending ? ` · ${pending} pending` : ""}`,
      );
    } catch (err) {
      setMemoryMeta("Could not load memory");
      setItems([]);
      console.error(err);
    }
  }

  async function refreshThreads(activeUser = userId) {
    setThreadsLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/threads?userId=${encodeURIComponent(activeUser)}`));
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { threads: ChatThread[] };
      setThreads(data.threads);
    } catch (err) {
      console.error(err);
      setThreads([]);
    } finally {
      setThreadsLoading(false);
    }
  }

  async function openThread(nextThreadId: string, activeUser = userId) {
    setThreadId(nextThreadId);
    storeThreadId(activeUser, nextThreadId);
    setMemoryOpen(false);
    try {
      const res = await fetch(
        apiUrl(`/api/threads/${encodeURIComponent(nextThreadId)}?userId=${encodeURIComponent(activeUser)}`),
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { messages: ThreadMessage[] };
      setMessages(toDisplayMessages(data.messages));
    } catch (err) {
      console.error(err);
      setMessages([
        {
          id: nextId("system"),
          role: "system",
          content: `Could not load thread: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    }
    inputRef.current?.focus();
  }

  async function refreshResources(activeUser = userId) {
    try {
      const res = await fetch(apiUrl(`/api/resources?userId=${encodeURIComponent(activeUser)}`));
      if (!res.ok) return;
      const data = (await res.json()) as { resources: ContextResource[] };
      setResources(data.resources);
    } catch (err) {
      console.error(err);
    }
  }

  async function openResourceTree(resourceId: string) {
    setTreeOpen(true);
    setTreeLoading(true);
    setTreeError(null);
    setTreeData(null);
    try {
      const res = await fetch(
        apiUrl(`/api/resources/${resourceId}/tree?userId=${encodeURIComponent(userId)}`),
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ResourceTopicTree;
      setTreeData(data);
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : String(err));
    } finally {
      setTreeLoading(false);
    }
  }

  async function loadConfig() {
    const res = await fetch(apiUrl("/api/config"));
    if (!res.ok) return;
    const { chat } = (await res.json()) as { chat: ChatConfig };
    if (chat.configured) {
      setSubtitle(`${chat.provider} · ${chat.model.split("/").pop()}`);
      setChatReady(true);
    } else {
      setSubtitle("Set FIREWORKS_API_KEY in .env");
      setChatReady(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only bootstrap
  useEffect(() => {
    void (async () => {
      await loadConfig();
      await refreshMemory();
      await refreshResources();
      await refreshThreads();
      const stored = loadStoredThreadId("demo-user");
      if (stored) {
        await openThread(stored, "demo-user");
      }
    })();
  }, []);

  useEffect(() => {
    if (!treeOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setTreeOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [treeOpen]);

  useEffect(() => {
    if (!memoryOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!memoryAnchorRef.current?.contains(event.target as Node)) {
        setMemoryOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMemoryOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [memoryOpen]);

  async function patchItem(id: string, status: "active" | "dismissed") {
    await fetch(apiUrl(`/api/memory/items/${id}?userId=${encodeURIComponent(userId)}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await refreshMemory();
  }

  async function pollIngestJob(jobId: string): Promise<IngestJobStatus> {
    for (let attempt = 0; attempt < 90; attempt++) {
      const res = await fetch(apiUrl(`/api/ingest/jobs/${jobId}`));
      if (!res.ok) throw new Error(`job poll failed: ${res.status}`);
      const status = (await res.json()) as IngestJobStatus;
      if (status.status === "ready" || status.status === "failed") return status;
      await sleep(1000);
    }
    throw new Error("ingest timed out");
  }

  function pushSystem(content: string) {
    setMessages((prev) => [...prev, { id: nextId("system"), role: "system", content }]);
  }

  async function onUpload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(apiUrl(`/api/ingest/upload?userId=${encodeURIComponent(userId)}`), {
        method: "POST",
        body,
      });
      const data = (await res.json()) as UploadIngestResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `upload failed: ${res.status}`);
      pushSystem(`Queued “${data.name}” for ingest…`);
      const status = await pollIngestJob(data.jobId);
      if (status.status === "failed") {
        pushSystem(`Ingest failed: ${status.error ?? "unknown error"}`);
      } else {
        pushSystem(
          `Ready: “${status.name}” · ${status.topicCount ?? "?"} topics · ${status.chunkCount ?? "?"} chunks`,
        );
      }
      await refreshResources();
    } catch (err) {
      pushSystem(`Upload error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending || !chatReady) return;
    const message = input.trim();
    if (!message) return;

    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { id: nextId("user"), role: "user", content: message }]);

    const messageId = nextId("msg");
    try {
      const res = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          message,
          messageId,
          ...(threadId ? { threadId } : {}),
        }),
      });
      const data = (await res.json()) as ChatResponse;
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId("assistant"),
            role: "assistant",
            content: `Error: ${data.error ?? res.status}`,
          },
        ]);
        return;
      }

      if (data.threadId) {
        setThreadId(data.threadId);
        storeThreadId(userId, data.threadId);
      }

      setMessages((prev) => [
        ...prev,
        { id: nextId("assistant"), role: "assistant", content: data.content },
      ]);

      await refreshThreads();

      if (data.memoryItems?.length) {
        await refreshMemory();
        const count = data.memoryItems.length;
        const pending = data.memoryItems.filter((item) => item.status === "pending").length;
        pushSystem(
          pending > 0
            ? `Drafted ${count} memory item(s) — ${pending} waiting in Memory →`
            : `Saved ${count} memory item(s) →`,
        );
        if (pending > 0) setMemoryOpen(true);
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function startNewChat() {
    setThreadId(null);
    storeThreadId(userId, null);
    setMessages([]);
    setMemoryOpen(false);
    inputRef.current?.focus();
  }

  function commitUserId() {
    const next = userDraft.trim() || "demo-user";
    setUserDraft(next);
    if (next === userId) return;
    setUserId(next);
    const stored = loadStoredThreadId(next);
    setThreadId(stored);
    setMessages([
      {
        id: nextId("system"),
        role: "system",
        content: `Switched to user “${next}”.`,
      },
    ]);
    void (async () => {
      await refreshMemory(next);
      await refreshResources(next);
      await refreshThreads(next);
      if (stored) await openThread(stored, next);
    })();
  }

  function applySuggestion(text: string) {
    setInput(text);
    inputRef.current?.focus();
  }

  return (
    <div className="desk">
      <div className="desk-glow" aria-hidden="true" />

      <aside className="sidebar glass">
        <div className="sidebar-brand">
          <span className="orb" aria-hidden="true" />
          <div>
            <strong>SYRAA</strong>
            <small>{subtitle}</small>
          </div>
        </div>

        <button type="button" className="new-chat-btn" onClick={startNewChat}>
          <span aria-hidden="true">+</span> New chat
        </button>

        <nav className="side-nav" aria-label="Primary">
          <div className="memory-anchor side-memory" ref={memoryAnchorRef}>
            <button
              type="button"
              className={`side-link${memoryOpen ? " is-active" : ""}`}
              aria-expanded={memoryOpen}
              aria-haspopup="dialog"
              onClick={() => setMemoryOpen((open) => !open)}
            >
              <span className="side-ico" aria-hidden="true">
                <BrainButton
                  open={memoryOpen}
                  pendingCount={0}
                  onToggle={() => {}}
                  variant="inline"
                />
              </span>
              Memory
              {pendingCount > 0 ? <em className="side-badge">{pendingCount}</em> : null}
            </button>
            <MemoryDropdown
              open={memoryOpen}
              items={items}
              meta={memoryMeta}
              onClose={() => setMemoryOpen(false)}
              onRefresh={() => void refreshMemory()}
              onConfirm={(id) => void patchItem(id, "active")}
              onDismiss={(id) => void patchItem(id, "dismissed")}
            />
          </div>
        </nav>

        <div className="sidebar-scroll">
          <div className="folders">
            <div className="folders-label">Chats</div>
            {threadsLoading && threads.length === 0 ? (
              <p className="thread-empty">Loading…</p>
            ) : threads.length === 0 ? (
              <p className="thread-empty">No chats yet — send a message to start</p>
            ) : (
              <ul className="thread-list thread-list-bare">
                {threads.map((thread) => (
                  <li key={thread.id}>
                    <button
                      type="button"
                      className={`thread-item${thread.id === threadId ? " is-active" : ""}`}
                      onClick={() => void openThread(thread.id)}
                      title={thread.title}
                    >
                      <span className="thread-title">{thread.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="folders-label">Folders</div>
            <div className="folder materials-folder">
              <div className="folder-head">
                <span className="folder-dot peach" />
                <div>
                  <strong>Materials</strong>
                  <small>
                    {resources.length === 0
                      ? "Upload PDFs from the composer"
                      : `${resources.length} document(s)`}
                  </small>
                </div>
                <button
                  type="button"
                  className="ghost-btn materials-refresh"
                  onClick={() => void refreshResources()}
                >
                  Refresh
                </button>
              </div>
              {resources.length > 0 ? (
                <ul className="materials-list">
                  {resources.map((resource) => (
                    <li key={resource.id}>
                      <button
                        type="button"
                        className="material-item"
                        onClick={() => void openResourceTree(resource.id)}
                        title="Open topic tree"
                      >
                        <span className="material-name">{resource.name}</span>
                        <span className={`material-status status-${resource.status}`}>
                          {resource.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="folder">
              <span className="folder-dot teal" />
              <div>
                <strong>Memory</strong>
                <small>
                  {items.length} item(s) · {pendingCount} pending
                </small>
              </div>
            </div>
          </div>
        </div>

        <label className="user-field">
          <span>User</span>
          <input
            value={userDraft}
            onChange={(event) => setUserDraft(event.target.value)}
            onBlur={commitUserId}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitUserId();
              }
            }}
          />
        </label>
      </aside>

      <main className="stage">
        <div className="suggestion-row">
          <span className="suggestion-label">Suggestion</span>
          <button
            type="button"
            className="suggestion-pill"
            onClick={() => applySuggestion("Remember that I prefer concise answers.")}
          >
            prefer concise answers
          </button>
          <button
            type="button"
            className="suggestion-pill"
            onClick={() => applySuggestion("What do you already know about me?")}
          >
            what do you know about me
          </button>
        </div>

        <section className={`canvas glass${hasThread ? " has-thread" : ""}`}>
          {!hasThread ? (
            <div className="hero">
              <div className="hero-orb" aria-hidden="true" />
              <p className="hero-eyebrow">SYRAA AI Chat</p>
              <h1>
                {greeting()}, {userId}
              </h1>
              <p className="hero-sub">How can I help you today?</p>
            </div>
          ) : (
            <MessageList messages={messages} />
          )}
        </section>

        <div className="composer-stack">
          <div className="upload-row">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onUpload(file);
              }}
            />
            <button
              type="button"
              className="upload-btn"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Upload a file"}
            </button>
            <span className="upload-hint">PDF → topic tree + embeddings</span>
          </div>
          <form id={formId} className="prompt glass" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={chatReady ? "Ask anything…" : "Configure API key to chat"}
              autoComplete="off"
              disabled={!chatReady || sending}
              aria-label="Message"
            />
            <button
              className="prompt-send"
              type="submit"
              disabled={!chatReady || sending || !input.trim()}
            >
              {sending ? "…" : "Send"}
            </button>
          </form>
        </div>
      </main>

      {treeOpen ? (
        <TopicTreeModal
          data={treeData}
          loading={treeLoading}
          error={treeError}
          onClose={() => setTreeOpen(false)}
        />
      ) : null}
    </div>
  );
}
