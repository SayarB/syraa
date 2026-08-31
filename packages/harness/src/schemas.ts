import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const chatProviderSchema = z.enum(["fireworks", "openai"]);

export const lessonKindSchema = z.enum(["preference", "rule", "method", "decision", "suggestion"]);

export const confidenceSchema = z.enum(["high", "medium", "low"]);

export const lessonSchema = z.object({
  text: z.string().min(1),
  kind: lessonKindSchema,
  open_loop: z.string().optional(),
  confidence: confidenceSchema.optional(),
  why: z.string().optional(),
});

export const turnResultSchema = z.object({
  message: z.string().min(1),
  lessons: z.array(lessonSchema).max(3).default([]),
});

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const chatRequestSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1),
  messageId: z.string().optional(),
  history: z.array(chatMessageSchema).optional(),
});

export const memoryItemPatchSchema = z.object({
  status: z.enum(["active", "pending", "dismissed", "superseded", "deleted"]),
});

export type ChatProvider = z.infer<typeof chatProviderSchema>;
export type LessonKind = z.infer<typeof lessonKindSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type TurnResult = z.infer<typeof turnResultSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

/** JSON Schema sent to the LLM (derived from Zod — single source of truth). */
export function turnResultJsonSchema(): Record<string, unknown> {
  const schema = zodToJsonSchema(turnResultSchema, {
    name: "everyday_turn",
    $refStrategy: "none",
  }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

export function parseTurnJson(raw: string): TurnResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ValidationError("Model returned invalid JSON");
  }

  const result = turnResultSchema.safeParse(json);
  if (!result.success) {
    throw new ValidationError(`Invalid model output: ${result.error.message}`);
  }

  return {
    message: result.data.message.trim(),
    lessons: result.data.lessons ?? [],
  };
}

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
