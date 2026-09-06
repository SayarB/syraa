import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { BrainButton } from "./components/BrainButton";
import { MemoryDropdown } from "./components/MemoryDropdown";
import { MessageList } from "./components/MessageList";
import { UiMessageList } from "./components/UiMessageList";
import { TopicTreeModal } from "./components/TopicTreeModal";
import { apiFetch, apiUrl } from "./lib/api";
import { authClient } from "./lib/auth-client";
import { formatMemorySavedNotice } from "./lib/memory-notice";
import type {
  ChatConfig,
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

type MemoryNoticeLine = {
  id: string;
  text: string;
  variant: "draft" | "saved";
};

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

function toUiMessages(messages: ThreadMessage[]): UIMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts as UIMessage["parts"],
  }));
}

function patchLastAssistantDisplayMessage(messages: UIMessage[], displayMessage: string): UIMessage[] {
  const next = [...messages];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index].role !== "assistant") continue;
    const hasText = next[index].parts.some((part) => part.type === "text");
    next[index] = {
      ...next[index],
      parts: hasText
        ? next[index].parts.map((part) =>
            part.type === "text"
              ? { ...part, text: displayMessage, state: "done" as const }
              : part,
          )
        : [...next[index].parts, { type: "text" as const, text: displayMessage, state: "done" as const }],
    };
    break;
  }
  return next;
}

export default function App() {
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState("SYRAA AI Chat");
  const [chatReady, setChatReady] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [systemMessages, setSystemMessages] = useState<DisplayMessage[]>([]);
  const [memoryNoticeLines, setMemoryNoticeLines] = useState<MemoryNoticeLine[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
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
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);


  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiUrl("/api/chat/stream"),
        credentials: "include",
        prepareSendMessagesRequest({ messages }) {
          const lastUser = [...messages].reverse().find((message) => message.role === "user");
          const text =
            lastUser?.parts
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n") ?? "";
          return {
            body: {
              ...(threadId ? { threadId } : {}),
              message: text,
              messageId: nextId("msg"),
            },
          };
        },
      }),
    [threadId],
  );

  const {
    messages: chatMessages,
    setMessages: setChatMessages,
    sendMessage,
    status: chatStatus,
  } = useChat({
    transport,
    onError: (error) => {
      pushSystem(`Chat error: ${error.message}`);
    },
    onData: (part) => {
      if (part.type === "data-syraa-turn") {
        const data = part.data as {
          threadId?: string;
          memoryItems?: MemoryItem[];
          displayMessage?: string;
        };
        if (data.threadId) {
          setThreadId(data.threadId);
          if (userId) storeThreadId(userId, data.threadId);
        }
        if (typeof data.displayMessage === "string" && data.displayMessage.trim()) {
          setChatMessages((prev) => patchLastAssistantDisplayMessage(prev, data.displayMessage!.trim()));
        }
        if (data.memoryItems?.length) {
          void (async () => {
            await refreshMemory();
            const pending = data.memoryItems?.filter((item) => item.status === "pending").length ?? 0;
            if (pending > 0) setMemoryOpen(true);
          })();
        }
      }
    },
    onFinish: () => {
      void refreshThreads();
    },
  });

  const pendingCount = items.filter((item) => item.status === "pending").length;
  const hasThread = chatMessages.some((message) => message.role === "user" || message.role === "assistant");
  const streaming = chatStatus === "streaming" || chatStatus === "submitted";

  async function refreshMemory() {
    try {
      const res = await apiFetch("/api/memory");
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

  async function refreshThreads() {
    setThreadsLoading(true);
    try {
      const res = await apiFetch("/api/threads");
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

  async function openThread(nextThreadId: string) {
    setThreadId(nextThreadId);
    if (userId) storeThreadId(userId, nextThreadId);
    setMemoryOpen(false);
    setMemoryNoticeLines([]);
    try {
      const res = await apiFetch(`/api/threads/${encodeURIComponent(nextThreadId)}`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { messages: ThreadMessage[] };
      setChatMessages(toUiMessages(data.messages));
    } catch (err) {
      console.error(err);
      setSystemMessages([
        {
          id: nextId("system"),
          role: "system",
          content: `Could not load thread: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    }
    inputRef.current?.focus();
  }

  async function refreshResources() {
    try {
      const res = await apiFetch("/api/resources");
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
      const res = await apiFetch(`/api/resources/${resourceId}/tree`);
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
    const res = await apiFetch("/api/config");
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
      const me = await apiFetch("/api/me");
      if (me.status === 401) {
        setAuthStatus("signed_out");
        return;
      }
      if (!me.ok) {
        setAuthStatus("signed_out");
        return;
      }
      const data = (await me.json()) as { userId: string; email: string };
      setUserId(data.userId);
      setUserEmail(data.email);
      setAuthStatus("signed_in");
      await refreshMemory();
      await refreshResources();
      await refreshThreads();
      const stored = loadStoredThreadId(data.userId);
      if (stored) {
        setThreadId(stored);
        try {
          const res = await apiFetch(`/api/threads/${encodeURIComponent(stored)}`);
          if (res.ok) {
            const threadData = (await res.json()) as { messages: ThreadMessage[] };
            setChatMessages(toUiMessages(threadData.messages));
          }
        } catch (err) {
          console.error(err);
        }
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
    const item = items.find((entry) => entry.id === id);
    const res = await apiFetch(`/api/memory/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      pushSystem(`Memory update failed: ${err.error ?? `HTTP ${res.status}`}`);
      return;
    }
    await refreshMemory();
    if (status === "active" && item) {
      const text = formatMemorySavedNotice([{ ...item, status: "active" }]);
      if (text) {
        setMemoryNoticeLines((prev) => [
          ...prev,
          { id: nextId("memory-saved"), text, variant: "saved" },
        ]);
      }
    }
  }

  async function pollIngestJob(jobId: string): Promise<IngestJobStatus> {
    for (let attempt = 0; attempt < 90; attempt++) {
      const res = await apiFetch(`/api/ingest/jobs/${jobId}`);
      if (!res.ok) throw new Error(`job poll failed: ${res.status}`);
      const status = (await res.json()) as IngestJobStatus;
      if (status.status === "ready" || status.status === "failed") return status;
      await sleep(1000);
    }
    throw new Error("ingest timed out");
  }

  function pushSystem(content: string) {
    setSystemMessages((prev) => [...prev, { id: nextId("system"), role: "system", content }]);
  }

  async function refreshThreadMaterials(activeThreadId = threadId) {
    if (!activeThreadId) return;
    try {
      await apiFetch(`/api/threads/${encodeURIComponent(activeThreadId)}/refresh-materials`, {
        method: "POST",
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function onUpload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await apiFetch("/api/ingest/upload", {
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
        await refreshThreadMaterials();
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
    if (streaming || !chatReady) return;
    const message = input.trim();
    if (!message) return;

    setInput("");
    setSending(true);
    try {
      await sendMessage({ text: message });
    } catch (err) {
      pushSystem(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function startNewChat() {
    setThreadId(null);
    if (userId) storeThreadId(userId, null);
    setChatMessages([]);
    setSystemMessages([]);
    setMemoryNoticeLines([]);
    setMemoryOpen(false);
    inputRef.current?.focus();
  }

  async function signOut() {
    try {
      await authClient.signOut();
    } catch (err) {
      console.error(err);
    }
    setAuthStatus("signed_out");
    setUserId(null);
    setUserEmail(null);
    setThreadId(null);
    setChatMessages([]);
    setThreads([]);
    setItems([]);
    setResources([]);
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      const email = authEmail.trim();
      const password = authPassword;
      if (!email || !password) {
        setAuthError("Email and password are required.");
        return;
      }
      if (authMode === "sign-up") {
        const result = await authClient.signUp.email({ email, password, name: email.split("@")[0] || "User" });
        if (result.error) {
          setAuthError(result.error.message || "Sign up failed");
          return;
        }
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) {
          setAuthError(result.error.message || "Sign in failed");
          return;
        }
      }
      const me = await apiFetch("/api/me");
      if (!me.ok) {
        setAuthError("Signed in, but session was not available. Try again.");
        return;
      }
      const data = (await me.json()) as { userId: string; email: string };
      setUserId(data.userId);
      setUserEmail(data.email);
      setAuthStatus("signed_in");
      setAuthPassword("");
      await refreshMemory();
      await refreshResources();
      await refreshThreads();
      const stored = loadStoredThreadId(data.userId);
      if (stored) {
        setThreadId(stored);
        try {
          const res = await apiFetch(`/api/threads/${encodeURIComponent(stored)}`);
          if (res.ok) {
            const threadData = (await res.json()) as { messages: ThreadMessage[] };
            setChatMessages(toUiMessages(threadData.messages));
          }
        } catch (err) {
          console.error(err);
        }
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthBusy(false);
    }
  }

  function applySuggestion(text: string) {
    setInput(text);
    inputRef.current?.focus();
  }

  if (authStatus === "loading") {
    return (
      <div className="desk">
        <div className="desk-glow" aria-hidden="true" />
        <main className="stage">
          <section className="canvas glass">
            <div className="hero">
              <p className="hero-eyebrow">SYRAA</p>
              <h1>Loading…</h1>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (authStatus === "signed_out") {
    return (
      <div className="desk">
        <div className="desk-glow" aria-hidden="true" />
        <main className="stage">
          <section className="canvas glass">
            <div className="hero">
              <div className="hero-orb" aria-hidden="true" />
              <p className="hero-eyebrow">SYRAA AI Chat</p>
              <h1>{authMode === "sign-in" ? "Sign in" : "Create account"}</h1>
              <p className="hero-sub">Your chats and memory stay with your account.</p>
              <form className="prompt glass" style={{ marginTop: "1.5rem", flexDirection: "column", gap: "0.75rem" }} onSubmit={(e) => void submitAuth(e)}>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  aria-label="Email"
                  disabled={authBusy}
                />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="Password"
                  autoComplete={authMode === "sign-in" ? "current-password" : "new-password"}
                  aria-label="Password"
                  disabled={authBusy}
                />
                {authError ? <p className="hero-sub" style={{ color: "crimson" }}>{authError}</p> : null}
                <button className="prompt-send" type="submit" disabled={authBusy}>
                  {authBusy ? "…" : authMode === "sign-in" ? "Sign in" : "Sign up"}
                </button>
              </form>
              <p className="hero-sub" style={{ marginTop: "1rem" }}>
                {authMode === "sign-in" ? (
                  <>
                    No account?{" "}
                    <button type="button" className="ghost-btn" onClick={() => { setAuthMode("sign-up"); setAuthError(null); }}>
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Have an account?{" "}
                    <button type="button" className="ghost-btn" onClick={() => { setAuthMode("sign-in"); setAuthError(null); }}>
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const displayName = userEmail ?? userId ?? "there";

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

        <div className="user-field">
          <span>Signed in</span>
          <small title={userId ?? undefined}>{displayName}</small>
          <button type="button" className="ghost-btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
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
                {greeting()}, {displayName}
              </h1>
              <p className="hero-sub">How can I help you today?</p>
            </div>
          ) : (
            <div className="messages-pane" aria-live="polite">
              <div className="messages-inner">
                <UiMessageList
                  messages={chatMessages}
                  streaming={streaming}
                  memoryNoticeLines={memoryNoticeLines}
                  onOpenMemory={() => setMemoryOpen(true)}
                />
                <MessageList messages={systemMessages} />
              </div>
            </div>
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
              disabled={!chatReady || streaming || sending}
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
