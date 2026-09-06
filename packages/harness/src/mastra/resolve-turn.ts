import { parseTurnJson, turnResultSchema, type Lesson } from "../schemas.js";
import { fallbackTurnFromToolCache } from "../tool-call-dedupe.js";

export type SyraaTurnMeta = {
  message: string;
  lessons: Lesson[];
};

export function turnFromStructuredObject(object: unknown): SyraaTurnMeta | null {
  const parsed = turnResultSchema.safeParse(object);
  if (!parsed.success) return null;
  return {
    message: parsed.data.message.trim(),
    lessons: parsed.data.lessons ?? [],
  };
}

export function turnFromAgentText(text: string): SyraaTurnMeta {
  const turn = parseTurnJson(text);
  return {
    message: turn.message.trim(),
    lessons: turn.lessons ?? [],
  };
}

export async function resolveTurnFromGenerateOutput(output: {
  object?: unknown | Promise<unknown>;
  text: string | Promise<string>;
}): Promise<SyraaTurnMeta> {
  try {
    const object = await output.object;
    const fromObject = turnFromStructuredObject(object);
    if (fromObject) return fromObject;
  } catch {
    // fall through to text parse
  }

  const text = (await output.text)?.trim() ?? "";
  if (!text) {
    const fallback = fallbackTurnFromToolCache();
    return {
      message: fallback.message.trim(),
      lessons: fallback.lessons,
    };
  }

  try {
    return turnFromAgentText(text);
  } catch {
    const fallback = fallbackTurnFromToolCache();
    return {
      message: fallback.message.trim(),
      lessons: fallback.lessons,
    };
  }
}

export async function resolveTurnFromStreamOutput(output: {
  object?: unknown | Promise<unknown>;
  text: string | Promise<string>;
}): Promise<SyraaTurnMeta> {
  return resolveTurnFromGenerateOutput(output);
}
