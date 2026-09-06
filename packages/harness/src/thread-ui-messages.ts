import { convertMessages, type MastraDBMessage } from "@mastra/core/agent";
import type { UIMessage } from "ai";

export type ThreadMessagePart = UIMessage["parts"][number];

export type ThreadUiMessageDto = {
  id: string;
  role: "user" | "assistant";
  parts: ThreadMessagePart[];
  createdAt: string;
};

function toIso(value: Date | string | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function isPersistedPart(part: ThreadMessagePart): boolean {
  if (part.type === "step-start") return true;
  if (part.type === "text") return part.text.trim().length > 0;
  if (part.type === "dynamic-tool") return true;
  if (part.type.startsWith("tool-")) return true;
  if (part.type.startsWith("data-")) return true;
  return false;
}

function sanitizeUiPart(part: ThreadMessagePart): ThreadMessagePart | null {
  if (part.type === "text") {
    const text = part.text.trim();
    if (!text) return null;
    return { ...part, text, state: "done" };
  }
  return part;
}

/** Mastra thread history → AI SDK UI messages (tools + text in order). */
export function mastraThreadToUiMessages(messages: MastraDBMessage[]): ThreadUiMessageDto[] {
  if (messages.length === 0) return [];

  const createdAtById = new Map(messages.map((message) => [message.id, toIso(message.createdAt)]));
  const uiMessages = convertMessages(messages).to("AIV6.UI") as UIMessage[];

  const result: ThreadUiMessageDto[] = [];
  for (const message of uiMessages) {
    if (message.role !== "user" && message.role !== "assistant") continue;

    const parts = message.parts
      .map((part) => sanitizeUiPart(part))
      .filter((part): part is ThreadMessagePart => part !== null && isPersistedPart(part));

    if (parts.length === 0) continue;

    result.push({
      id: message.id,
      role: message.role,
      parts,
      createdAt: createdAtById.get(message.id) ?? new Date().toISOString(),
    });
  }

  return result;
}
