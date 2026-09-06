export const THINKING_PHRASES = [
  "Thinking…",
  "Combulating…",
  "Consulting your docs…",
  "Connecting the dots…",
  "Reading between the lines…",
  "Pondering deeply…",
  "Almost there…",
] as const;

export function pickThinkingPhrase(tick: number): string {
  return THINKING_PHRASES[tick % THINKING_PHRASES.length];
}
