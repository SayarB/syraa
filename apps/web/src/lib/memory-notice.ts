import type { MemoryItem } from "./types";

export type MemoryNoticeVariant = "draft" | "saved";

export function formatMemoryDraftNotice(items: MemoryItem[]): string | null {
  if (items.length === 0) return null;
  const pending = items.filter((item) => item.status === "pending").length;
  if (pending === 0) return null;
  return `Drafted ${items.length} memory item(s) — ${pending} waiting in Memory →`;
}

export function formatMemorySavedNotice(items: MemoryItem[]): string | null {
  if (items.length === 0) return null;
  return `Saved ${items.length} memory item(s) →`;
}

/** @deprecated Use formatMemoryDraftNotice or formatMemorySavedNotice */
export function formatMemoryNotice(items: MemoryItem[]): string | null {
  return formatMemoryDraftNotice(items) ?? formatMemorySavedNotice(items);
}
