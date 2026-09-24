import { fallbackTurnFromToolCache } from "../tool-call-dedupe.js";

export type SyraaTurnMeta = {
  message: string;
};

const FOOTER_LINE =
  /^\s*(?:[-*_]{3,}\s*)?[*_]*\s*(?:working memory updated|memory updated|lessons? (?:extracted|saved|recorded)|_?agentNote)(?![a-z0-9]).*$/i;
const BLANK_OR_RULE = /^\s*(?:[-*_]{3,})?\s*$/;

/** Drop trailing runtime/status lines the model sometimes appends (and a dangling rule before them). */
export function stripRuntimeFooters(text: string): string {
  const lines = text.trimEnd().split("\n");
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (!FOOTER_LINE.test(last) && !BLANK_OR_RULE.test(last)) break;
    lines.pop();
  }
  return lines.join("\n").trim();
}

/**
 * Whole reply text of a generate() result. After a tool step Mastra's `text` is only the last
 * step's text, so join every step's text instead.
 */
export function fullReplyText(output: { text?: string; steps?: { text?: string }[] }): string {
  const fromSteps = (output.steps ?? []).map((step) => step.text ?? "").join("");
  return fromSteps.trim() ? fromSteps : (output.text ?? "");
}

export async function resolveTurnFromGenerateOutput(output: {
  text: string | Promise<string>;
}): Promise<SyraaTurnMeta> {
  const text = stripRuntimeFooters((await output.text) ?? "");
  return { message: text || fallbackTurnFromToolCache().message.trim() };
}

export const resolveTurnFromStreamOutput = resolveTurnFromGenerateOutput;
