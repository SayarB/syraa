/** Rough token count: about four characters per token. Good enough for budgets, not for billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const CLIP_MARKER = " […]";

/** Cuts `text` to at most `maxChars`, ending with a marker so the model knows it was shortened. */
export function clipText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= CLIP_MARKER.length) return text.slice(0, Math.max(0, maxChars));
  return `${text.slice(0, maxChars - CLIP_MARKER.length).trimEnd()}${CLIP_MARKER}`;
}
