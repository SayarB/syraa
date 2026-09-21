import { z } from "zod";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const chatProviderSchema = z.enum(["fireworks", "openai"]);

export const lessonKindSchema = z.enum(["preference", "rule", "method", "decision", "suggestion"]);

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1),
  messageId: z.string().optional(),
  /** Mastra Memory thread id. Created server-side when omitted. */
  threadId: z.string().trim().min(1).optional(),
  /** Reserved for future Works attach — stored on thread metadata only. */
  projectId: z.string().trim().min(1).nullable().optional(),
  subprojectId: z.string().trim().min(1).nullable().optional(),
  /** @deprecated Ignored — Mastra Memory owns transcript. Kept for old clients. */
  history: z.array(chatMessageSchema).optional(),
});

export const createThreadRequestSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
  subprojectId: z.string().trim().min(1).nullable().optional(),
});

export const memoryItemPatchSchema = z.object({
  status: z.enum(["active", "pending", "dismissed", "superseded", "deleted"]),
});

export type ChatProvider = z.infer<typeof chatProviderSchema>;
export type LessonKind = z.infer<typeof lessonKindSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

export async function parseJsonBody<T>(
  raw: string,
  schema: z.ZodType<T>,
  label = "request body",
): Promise<T> {
  if (!raw.trim()) {
    throw new ValidationError(`empty ${label}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ValidationError(`invalid JSON in ${label}`);
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((issue) => issue.message).join("; "));
  }

  return result.data;
}
