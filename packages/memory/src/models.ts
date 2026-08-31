export type MemoryScope = "user" | "kind" | "subproject";
export type ItemType = "preference" | "rule" | "method" | "decision" | "fact_ref";
export type ItemStatus = "pending" | "active" | "superseded" | "dismissed" | "deleted";
export type ItemSource = "explicit" | "distilled" | "promoted" | "forked";
export type Confidence = "high" | "medium" | "low";
export type CreatedBy = "user" | "system";

export const ITEM_TYPES: readonly ItemType[] = [
  "preference",
  "rule",
  "method",
  "decision",
  "fact_ref",
] as const;

export const ITEM_STATUSES: readonly ItemStatus[] = [
  "pending",
  "active",
  "superseded",
  "dismissed",
  "deleted",
] as const;

export function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function makeScopeKey(
  scope: MemoryScope,
  kindId?: string | null,
  subprojectId?: string | null,
): string {
  if (scope === "user") return "user";
  if (scope === "kind") {
    if (!kindId) throw new Error("kind scope requires kindId");
    return `kind:${kindId}`;
  }
  if (!kindId || !subprojectId) {
    throw new Error("subproject scope requires kindId and subprojectId");
  }
  return `subproject:${kindId}:${subprojectId}`;
}

export function validateScopeIds(
  scope: MemoryScope,
  kindId?: string | null,
  subprojectId?: string | null,
): { scope: MemoryScope; kindId: string | null; subprojectId: string | null } {
  if (scope === "user") {
    if (kindId != null || subprojectId != null) {
      throw new Error("user scope must not set kindId or subprojectId");
    }
    return { scope, kindId: null, subprojectId: null };
  }
  if (scope === "kind") {
    if (!kindId) throw new Error("kind scope requires kindId");
    if (subprojectId != null) throw new Error("kind scope must not set subprojectId");
    return { scope, kindId, subprojectId: null };
  }
  if (!kindId || !subprojectId) {
    throw new Error("subproject scope requires kindId and subprojectId");
  }
  return { scope, kindId, subprojectId };
}

export function isItemType(value: string): value is ItemType {
  return (ITEM_TYPES as readonly string[]).includes(value);
}

export function isItemStatus(value: string): value is ItemStatus {
  return (ITEM_STATUSES as readonly string[]).includes(value);
}

export interface Memory {
  id: string;
  userId: string;
  scope: MemoryScope;
  kindId: string | null;
  subprojectId: string | null;
  brief: string | null;
  openLoops: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryItem {
  id: string;
  memoryId: string;
  type: ItemType;
  text: string;
  status: ItemStatus;
  source: ItemSource;
  confidence: Confidence;
  needsConfirm: boolean;
  priority: number;
  tags: string[];
  why: string | null;
  evidenceSessionId: string | null;
  evidenceMessageIds: string[];
  evidenceArtifactKey: string | null;
  factResourceId: string | null;
  factPath: string | null;
  supersedesId: string | null;
  forkedFromId: string | null;
  createdBy: CreatedBy;
  confirmedAt: string | null;
  confirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
