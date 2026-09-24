import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { PaperclipIcon } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthShell, SignInCard } from "@/components/auth-screen";
import { ChatMessages, type MemoryNoticeLine } from "@/components/chat-messages";
import { ThemeModeToggle } from "@/components/theme-mode-toggle";
import { TopicTreeDialog } from "@/components/topic-tree-dialog";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { apiFetch, apiUrl } from "./lib/api";
import { authClient } from "./lib/auth-client";
import { patchAssistantDisplayMessage } from "./lib/display-message";
import { formatMemorySavedNotice } from "./lib/memory-notice";
import { type SavedTheme, useTheme } from "./lib/theme";
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

const SUGGESTIONS = [
  { label: "prefer concise answers", prompt: "Remember that I prefer concise answers." },
  { label: "what do you know about me", prompt: "What do you already know about me?" },
];

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authSent, setAuthSent] = useState(false);
  const [googleAuthEnabled, setGoogleAuthEnabled] = useState(false);
  const { theme, setPalette, toggleMode, adoptSaved } = useTheme(authStatus === "signed_in");

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

  // Final reply from data-syraa-turn. Applied in onFinish: useChat re-writes its own copy of the
  // streamed message right after onData, so a patch made there would be overwritten.
  const pendingDisplayMessage = useRef<string | null>(null);

  const {
    messages: chatMessages,
    setMessages: setChatMessages,
    sendMessage,
    status: chatStatus,
    stop,
  } = useChat({
    transport,
    onError: (error) => {
      pendingDisplayMessage.current = null;
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
          pendingDisplayMessage.current = data.displayMessage.trim();
        }
        if (data.memoryItems?.length) {
          void (async () => {
            await refreshMemory();
            const pending =
              data.memoryItems?.filter((item) => item.status === "pending").length ?? 0;
            if (pending > 0) setMemoryOpen(true);
          })();
        }
      }
    },
    onFinish: ({ message }) => {
      const displayMessage = pendingDisplayMessage.current;
      pendingDisplayMessage.current = null;
      if (displayMessage) {
        setChatMessages((prev) => patchAssistantDisplayMessage(prev, message.id, displayMessage));
      }
      void refreshThreads();
    },
  });

  const pendingCount = items.filter((item) => item.status === "pending").length;
  const hasThread = chatMessages.some(
    (message) => message.role === "user" || message.role === "assistant",
  );
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
    const data = (await res.json()) as {
      chat: ChatConfig;
      auth?: { google?: boolean; magicLink?: boolean };
    };
    if (data.chat.configured) {
      setSubtitle(`${data.chat.provider} · ${data.chat.model.split("/").pop()}`);
      setChatReady(true);
    } else {
      setSubtitle("Set FIREWORKS_API_KEY in .env");
      setChatReady(false);
    }
    setGoogleAuthEnabled(Boolean(data.auth?.google));
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
      const data = (await me.json()) as { userId: string; email: string; theme?: SavedTheme };
      adoptSaved(data.theme);
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

  async function onSubmit({ text }: PromptInputMessage) {
    if (streaming || !chatReady) return;
    const message = text.trim();
    if (!message) return;

    setInput("");
    setSending(true);
    try {
      pendingDisplayMessage.current = null;
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

  async function signInWithGoogle() {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (result.error) {
        setAuthError(result.error.message || "Google sign-in failed");
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitMagicLink(event: FormEvent) {
    event.preventDefault();
    setAuthError(null);
    setAuthSent(false);
    setAuthBusy(true);
    try {
      const email = authEmail.trim();
      if (!email) {
        setAuthError("Enter your email.");
        return;
      }
      const result = await authClient.signIn.magicLink({
        email,
        name: email.split("@")[0] || "User",
        callbackURL: "/",
      });
      if (result.error) {
        setAuthError(result.error.message || "Could not send sign-in link");
        return;
      }
      setAuthSent(true);
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

  const modeToggle = <ThemeModeToggle mode={theme.mode} onToggle={toggleMode} />;

  if (authStatus === "loading") {
    return (
      <TooltipProvider>
        <AuthShell toolbar={modeToggle}>
          <p className="text-muted-foreground text-sm">Loading…</p>
        </AuthShell>
      </TooltipProvider>
    );
  }

  if (authStatus === "signed_out") {
    return (
      <TooltipProvider>
        <AuthShell toolbar={modeToggle}>
          <SignInCard
            googleEnabled={googleAuthEnabled}
            email={authEmail}
            onEmailChange={setAuthEmail}
            busy={authBusy}
            sent={authSent}
            error={authError}
            onGoogle={() => void signInWithGoogle()}
            onMagicLink={(event: FormEvent) => void submitMagicLink(event)}
            onUseDifferentEmail={() => {
              setAuthSent(false);
              setAuthError(null);
            }}
          />
        </AuthShell>
      </TooltipProvider>
    );
  }

  const displayName = userEmail ?? userId ?? "there";
  const activeThreadTitle = threads.find((thread) => thread.id === threadId)?.title ?? "New chat";

  return (
    <TooltipProvider>
      <SidebarProvider className="h-full min-h-0">
        <AppSidebar
          subtitle={subtitle}
          onNewChat={startNewChat}
          memory={{
            items,
            meta: memoryMeta,
            pendingCount,
            open: memoryOpen,
            onOpenChange: setMemoryOpen,
            onRefresh: () => void refreshMemory(),
            onConfirm: (id) => void patchItem(id, "active"),
            onDismiss: (id) => void patchItem(id, "dismissed"),
          }}
          threads={threads}
          threadsLoading={threadsLoading}
          activeThreadId={threadId}
          onOpenThread={(id) => void openThread(id)}
          resources={resources}
          onRefreshResources={() => void refreshResources()}
          onOpenResource={(id) => void openResourceTree(id)}
          displayName={displayName}
          palette={theme.palette}
          onPaletteChange={setPalette}
          onSignOut={() => void signOut()}
        />

        <SidebarInset className="min-h-0 overflow-hidden md:shadow-soft">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 md:px-5">
            <SidebarTrigger className="md:hidden" />
            <h1 className="min-w-0 flex-1 truncate font-semibold text-sm">{activeThreadTitle}</h1>
            {modeToggle}
          </header>

          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="mx-auto w-full max-w-3xl gap-5 px-4 py-6 md:px-6">
              {hasThread ? (
                <ChatMessages
                  messages={chatMessages}
                  streaming={streaming}
                  memoryNoticeLines={memoryNoticeLines}
                  systemMessages={systemMessages}
                  onOpenMemory={() => setMemoryOpen(true)}
                />
              ) : (
                <ConversationEmptyState className="min-h-[50vh]">
                  <span className="grid size-12 place-items-center rounded-2xl bg-primary font-semibold text-lg text-primary-foreground">
                    S
                  </span>
                  <h2 className="font-semibold text-2xl tracking-tight">
                    {greeting()}, {displayName}
                  </h2>
                  <p className="text-muted-foreground">How can I help you today?</p>
                  {systemMessages.map((message) => (
                    <p key={message.id} className="text-muted-foreground text-xs">
                      {message.content}
                    </p>
                  ))}
                </ConversationEmptyState>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="mx-auto grid w-full max-w-3xl gap-3 px-4 pb-4 md:px-6 md:pb-5">
            <Suggestions>
              {SUGGESTIONS.map((suggestion) => (
                <Suggestion
                  key={suggestion.label}
                  suggestion={suggestion.label}
                  variant="secondary"
                  onClick={() => applySuggestion(suggestion.prompt)}
                />
              ))}
            </Suggestions>

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

            <PromptInput
              onSubmit={(message) => onSubmit(message)}
              className="rounded-2xl bg-field shadow-soft [&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:border-input"
            >
              <PromptInputBody>
                <PromptInputTextarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={chatReady ? "Ask anything…" : "Configure API key to chat"}
                  disabled={!chatReady || sending}
                  aria-label="Message"
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputButton
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <PaperclipIcon />
                    {uploading ? "Uploading…" : "Upload PDF"}
                  </PromptInputButton>
                  <span className="hidden text-muted-foreground text-xs sm:inline">
                    PDF → topic tree + embeddings
                  </span>
                </PromptInputTools>
                <PromptInputSubmit
                  status={chatStatus}
                  onStop={stop}
                  disabled={!chatReady || (!streaming && !input.trim())}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </SidebarInset>

        <TopicTreeDialog
          open={treeOpen}
          onOpenChange={setTreeOpen}
          data={treeData}
          loading={treeLoading}
          error={treeError}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}
