import type { ItemType, MemoryItem, MemoryService } from "@syraa/memory";
import type { Lesson, LessonKind } from "./schemas.js";

const LESSON_KIND_TO_TYPE: Record<LessonKind, ItemType> = {
  preference: "preference",
  rule: "rule",
  method: "method",
  decision: "decision",
  suggestion: "method",
};

const EXPLICIT_MARKERS =
  /\b(always|never|every time|from now on|remember that|don't ever|do not ever)\b/i;

export function lessonToItemType(kind: LessonKind): ItemType {
  return LESSON_KIND_TO_TYPE[kind];
}

export function shouldAutoActivate(lesson: Lesson, userMessage: string): boolean {
  if (lesson.kind === "rule") return true;
  return EXPLICIT_MARKERS.test(userMessage) || EXPLICIT_MARKERS.test(lesson.text);
}

/** Normalize lesson text for duplicate checks. */
export function normalizeLessonText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`'"“”‘’]/g, "")
    .replace(/[.,!?;:]+$/g, "")
    .replace(/\s+/g, " ");
}

/** Stable key for near-duplicate lesson matching. */
export function lessonDedupKey(text: string): string {
  let normalized = normalizeLessonText(text);

  const triggerResponse = normalized.match(
    /when (?:the )?user says (.+?)(?:,|\s+)(?:respond(?:s)? with|reply with|say) (.+)$/,
  );
  if (triggerResponse) {
    return `rule:${normalizeLessonText(triggerResponse[1])}=>${normalizeLessonText(triggerResponse[2])}`;
  }

  normalized = normalized.replace(/^user\s+/, "");
  normalized = normalized.replace(/^prefers?\s+/, "prefer ");
  return normalized;
}

export function isDuplicateLesson(existing: MemoryItem[], text: string): boolean {
  const key = lessonDedupKey(text);
  if (!key) return true;

  for (const item of existing) {
    const existingKey = lessonDedupKey(item.text);
    if (existingKey === key) return true;

    const a = normalizeLessonText(text);
    const b = normalizeLessonText(item.text);
    if (a === b) return true;

    if (a.length >= 12 && b.length >= 12 && (a.includes(b) || b.includes(a))) {
      const shorter = Math.min(a.length, b.length);
      const longer = Math.max(a.length, b.length);
      if (shorter / longer >= 0.72) return true;
    }
  }

  return false;
}

function normalize(text: string): string {
  return normalizeLessonText(text);
}

function isDuplicate(existing: MemoryItem[], text: string): boolean {
  return isDuplicateLesson(existing, text);
}

export async function applyLessons(
  service: MemoryService,
  opts: {
    userId: string;
    memoryId: string;
    lessons: Lesson[];
    userMessage: string;
    messageId?: string;
    existingItems: MemoryItem[];
  },
): Promise<MemoryItem[]> {
  const created: MemoryItem[] = [];
  const capped = opts.lessons.slice(0, 3);

  for (const lesson of capped) {
    const text = lesson.text.trim();
    if (!text) continue;
    if (isDuplicate(opts.existingItems, text)) continue;
    if (isDuplicate(created, text)) continue;

    const autoActivate = shouldAutoActivate(lesson, opts.userMessage);
    const item = await service.createItem({
      userId: opts.userId,
      memoryId: opts.memoryId,
      type: lessonToItemType(lesson.kind),
      text,
      source: autoActivate ? "explicit" : "distilled",
      confidence: lesson.confidence ?? "medium",
      needsConfirm: !autoActivate,
      status: autoActivate ? "active" : "pending",
      why: lesson.why ?? null,
      evidenceMessageIds: opts.messageId ? [opts.messageId] : [],
      createdBy: "system",
    });

    created.push(item);
    opts.existingItems.push(item);

    if (lesson.open_loop?.trim()) {
      const memory = await service.getMemory({ memoryId: opts.memoryId });
      const loops = memory?.openLoops ?? [];
      const loop = lesson.open_loop.trim();
      if (!loops.includes(loop)) {
        await service.updateOpenLoops(opts.userId, [...loops, loop], { memoryId: opts.memoryId });
      }
    }
  }

  return created;
}
