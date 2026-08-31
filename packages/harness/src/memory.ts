import {
  createMemoryService,
  createPostgresMemoryRepository,
  type MemoryItem,
  type MemoryService,
} from "@everyday/memory";

export type MemoryHandle = {
  service: MemoryService;
  close: () => Promise<void>;
};

let handle: MemoryHandle | null = null;

export async function getMemory(): Promise<MemoryHandle> {
  if (!handle) {
    const repo = await createPostgresMemoryRepository();
    handle = {
      service: createMemoryService(repo),
      close: () => repo.close(),
    };
  }
  return handle;
}

export type SaveCommand = {
  type: "preference" | "rule" | "method" | "decision";
  text: string;
};

const TYPE_ALIASES: Record<string, SaveCommand["type"]> = {
  pref: "preference",
  preference: "preference",
  rule: "rule",
  method: "method",
  decision: "decision",
};

export function parseSaveCommand(message: string): SaveCommand | null {
  const trimmed = message.trim();
  const saveMatch = trimmed.match(/^\/save\s+(\w+)\s+([\s\S]+)$/i);
  if (saveMatch) {
    const type = TYPE_ALIASES[saveMatch[1].toLowerCase()];
    if (!type) return null;
    return { type, text: saveMatch[2].trim() };
  }

  const shortMatch = trimmed.match(/^\/(pref|preference|rule|method|decision)\s+([\s\S]+)$/i);
  if (shortMatch) {
    const type = TYPE_ALIASES[shortMatch[1].toLowerCase()];
    if (!type) return null;
    return { type, text: shortMatch[2].trim() };
  }

  return null;
}

export async function saveMemoryItem(
  service: MemoryService,
  userId: string,
  command: SaveCommand,
  evidenceMessageId?: string,
): Promise<MemoryItem> {
  return service.createItem({
    userId,
    scope: "user",
    type: command.type,
    text: command.text,
    source: "explicit",
    evidenceMessageIds: evidenceMessageId ? [evidenceMessageId] : [],
    createdBy: "user",
  });
}

export async function listMemoryForUser(service: MemoryService, userId: string) {
  const memory = await service.ensureMemory(userId, "user");
  const items = await service.listItems(userId, {
    memoryId: memory.id,
    limit: 100,
    statuses: ["active", "pending"],
  });
  return { memory, items };
}
