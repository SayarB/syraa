export { ensureHarnessReady } from "./bootstrap.js";
export type { ChatRequest, ChatResponse } from "./chat.js";
export { closeHarness, handleChat, pipeChatStream } from "./chat.js";
export type { ContextHandle } from "./context.js";
export {
  closeContextAndQueue,
  ensureContextReady,
  getContextStore,
  getIngestQueue,
} from "./context.js";
export { formatHarnessError } from "./errors.js";
export { applyLessons, isDuplicateLesson, lessonDedupKey, lessonToItemType, normalizeLessonText, shouldAutoActivate } from "./lessons.js";
export type { ChatConfig, ChatMessage, ChatProvider } from "./llm.js";
export { getChatConfig, resolveChatProvider, runChatTurn } from "./llm.js";
export type { MemoryHandle, SaveCommand } from "./memory.js";
export {
  getMemory,
  listMemoryForUser,
  parseSaveCommand,
  saveMemoryItem,
} from "./memory.js";
export type {
  ChatRequestInput,
  Lesson,
  LessonKind,
  TurnResult,
} from "./schemas.js";
export {
  chatMessageSchema,
  chatProviderSchema,
  chatRequestSchema,
  createThreadRequestSchema,
  confidenceSchema,
  lessonKindSchema,
  lessonSchema,
  memoryItemPatchSchema,
  parseJsonBody,
  parseTurnJson,
  turnResultJsonSchema,
  turnResultSchema,
  ValidationError,
} from "./schemas.js";
export type { HarnessServerOptions } from "./server.js";
export { createHarnessServer } from "./server.js";
export type { ThreadDto, ThreadMessageDto, ThreadWorksMetadata } from "./threads.js";
export {
  buildThreadWorksMetadata,
  createChatThread,
  ensureChatThread,
  listChatThreads,
  listThreadMessages,
  maybeSetThreadTitle,
} from "./threads.js";
export type { UploadIngestResult } from "./upload.js";
export { getIngestJobStatus, handleIngestUpload } from "./upload.js";
export {
  buildMaterialsWorkingMemoryContent,
  seedMaterialsWorkingMemory,
} from "./materials-working-memory.js";
