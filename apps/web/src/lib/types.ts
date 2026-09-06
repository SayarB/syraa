export type ChatRole = "user" | "assistant" | "system" | "activity";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DisplayMessage = {
  id: string;
  role: ChatRole;
  content: string;
  streaming?: boolean;
};

export type MemoryItem = {
  id: string;
  type: string;
  text: string;
  status: string;
  source: string;
  why?: string | null;
  createdAt: string;
};

export type MemorySnapshot = {
  memory: { id: string };
  items: MemoryItem[];
};

export type ChatConfig = {
  provider: string;
  model: string;
  configured: boolean;
};

export type ChatResponse = {
  role: "assistant";
  content: string;
  threadId?: string;
  memoryItems?: MemoryItem[];
  error?: string;
};

export type ChatThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  placement: "global" | "attached";
  projectId: string | null;
  subprojectId: string | null;
};

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  parts: Array<
    | { type: "text"; text: string; state?: "done" | "streaming" }
    | { type: string; [key: string]: unknown }
  >;
  createdAt: string;
};

export type UploadIngestResponse = {
  jobId: string;
  resourceId: string;
  name: string;
  mime: string;
  status: "queued";
};

export type IngestJobStatus = {
  jobId: string;
  userId: string;
  resourceId: string;
  status: "queued" | "processing" | "ready" | "failed";
  name: string;
  mime: string;
  error?: string;
  topicCount?: string;
  chunkCount?: string;
  bridgeCount?: string;
  leafCount?: string;
  embeddingProvider?: string;
  updatedAt: string;
};

export type ContextResource = {
  id: string;
  userId: string;
  name: string;
  path: string;
  status: string;
  ingestError?: string | null;
  createdAt: string;
  updatedAt: string;
  ingestedAt?: string | null;
};

export type TopicTreeNode = {
  id: string;
  kind: "topic" | "chunk";
  title: string;
  depth: number;
  ordinal: number;
  role?: string;
  text?: string;
  children: TopicTreeNode[];
};

export type ResourceTopicTree = {
  resource: ContextResource;
  tree: TopicTreeNode[];
  topicCount: number;
  chunkCount: number;
};
