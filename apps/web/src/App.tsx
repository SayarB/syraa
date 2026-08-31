import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { BrainButton } from "./components/BrainButton";
import { MemoryDropdown } from "./components/MemoryDropdown";
import { MessageList } from "./components/MessageList";
import { TopicTreeModal } from "./components/TopicTreeModal";
import { apiUrl } from "./lib/api";
import type {
  ChatConfig,
  ChatMessage,
  ChatResponse,
  ContextResource,
  DisplayMessage,
  IngestJobStatus,
  MemoryItem,
  MemorySnapshot,
  ResourceTopicTree,
  UploadIngestResponse,
} from "./lib/types";

function nextId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
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

export default function App() {
  const [userId, setUserId] = useState("demo-user");
  const [userDraft, setUserDraft] = useState("demo-user");
  const [subtitle, setSubtitle] = useState("SYRAA AI Chat");
  const [chatReady, setChatReady] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
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

  async function refreshResources(activeUser = userId) {
    try {
      const res = await fetch(apiUrl(`/api/resources?userId=${encodeURIComponent(activeUser)}`));
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { resources: ContextResource[] };
      setResources(data.resources ?? []);
    } catch (err) {
      console.error(err);
      setResources([]);
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
    void loadConfig();
    void refreshMemory();
    void refreshResources();
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
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const status = (await res.json()) as IngestJobStatus;
      if (status.status === "ready" || status.status === "failed") {
        return status;
      }
      await sleep(1000);
    }
    throw new Error("ingest timed out");
  }

  function pushSystem(content: string) {
    setMessages((prev) => [...prev, { id: nextId("system"), role: "system", content }]);
  }

  async function onUploadFile(file: File) {
    if (uploading) return;
    setUploading(true);
    const statusMsgId = nextId("system");
    setMessages((prev) => [
      ...prev,
      { id: statusMsgId, role: "system", content: `Uploading “${file.name}”…` },
    ]);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("userId", userId);

      const res = await fetch(apiUrl("/api/ingest/upload"), {
        method: "POST",
        body,
      });
      const data = (await res.json()) as UploadIngestResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === statusMsgId
            ? {
                ...msg,
                content: `Queued “${data.name}” for ingest (job ${data.jobId.slice(0, 8)}…)`,
              }
            : msg,
        ),
      );

      const finalStatus = await pollIngestJob(data.jobId);
      if (finalStatus.status === "failed") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === statusMsgId
              ? {
                  ...msg,
                  content: `Ingest failed for “${file.name}”: ${finalStatus.error ?? "unknown error"}`,
                }
              : msg,
          ),
        );
        return;
      }

      const topics = finalStatus.topicCount ?? "?";
      const chunks = finalStatus.chunkCount ?? "?";
      const embedNote =
        finalStatus.embeddingProvider && finalStatus.embeddingProvider !== "none"
          ? ` · embeddings via ${finalStatus.embeddingProvider}`
          : " · embeddings skipped (set EMBEDDING_PROVIDER / API key)";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === statusMsgId
            ? {
                ...msg,
                content: `Ingested “${file.name}” — ${topics} topics, ${chunks} chunks${embedNote}`,
              }
            : msg,
        ),
      );
      await refreshResources();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === statusMsgId
            ? { ...msg, content: `Upload failed for “${file.name}”: ${message}` }
            : msg,
        ),
      );
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
        body: JSON.stringify({ userId, message, messageId, history }),
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

      setMessages((prev) => [
        ...prev,
        { id: nextId("assistant"), role: "assistant", content: data.content },
      ]);
      setHistory((prev) => [
        ...prev,
        { role: "user", content: message },
        { role: "assistant", content: data.content },
      ]);

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
    setHistory([]);
    setMessages([]);
    setMemoryOpen(false);
    inputRef.current?.focus();
  }

  function commitUserId() {
    const next = userDraft.trim() || "demo-user";
    setUserDraft(next);
    if (next === userId) return;
    setUserId(next);
    setHistory([]);
    setMessages([
      {
        id: nextId("system"),
        role: "system",
        content: `Switched to user “${next}”.`,
      },
    ]);
    void refreshMemory(next);
    void refreshResources(next);
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
          <button type="button" className="side-link is-active">
            <span className="side-ico" aria-hidden="true">
              ⌕
            </span>
            Search chat
          </button>
          <button type="button" className="side-link" disabled title="Coming soon">
            <span className="side-ico" aria-hidden="true">
              ▦
            </span>
            Library
          </button>
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

        <div className="folders">
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
            spellCheck={false}
            aria-label="User id"
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
                if (file) void onUploadFile(file);
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
              placeholder="Ask anything…"
              autoComplete="off"
              disabled={!chatReady || sending}
            />
            <button
              className="prompt-send"
              type="submit"
              disabled={!chatReady || sending || !input.trim()}
            >
              Send
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
