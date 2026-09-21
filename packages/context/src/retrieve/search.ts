export type RetrieveMode = "hybrid" | "lexical" | "semantic";

const MAX_TERMS = 12;

/** Split on non-letter/digit, lowercase, drop 1-char tokens, dedupe, cap. */
export function queryTerms(query: string): string[] {
  const terms: string[] = [];
  for (const raw of query.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || terms.includes(raw)) continue;
    terms.push(raw);
    if (terms.length >= MAX_TERMS) break;
  }
  return terms;
}

/** OR query for `to_tsquery` — terms are already `[\p{L}\p{N}]+`, so no tsquery syntax leaks in. */
export function toOrTsQuery(terms: string[]): string | null {
  return terms.length > 0 ? terms.join(" | ") : null;
}

/** `%term%` patterns for ILIKE with `\`, `%`, `_` escaped. */
export function toLikePatterns(terms: string[]): string[] {
  return terms.map((term) => `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Reciprocal rank fusion over ranked id lists (best first). */
export function reciprocalRankFusion(
  lists: string[][],
  k = 60,
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/** Window of `maxChars` centred on the first term hit; leading text when no term matches. */
export function makeSnippet(text: string, terms: string[], maxChars = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;

  const lower = clean.toLowerCase();
  let hit = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx !== -1 && (hit === -1 || idx < hit)) hit = idx;
  }

  const start =
    hit === -1 ? 0 : Math.max(0, Math.min(hit - Math.floor(maxChars / 3), clean.length - maxChars));
  const end = start + maxChars;
  return `${start > 0 ? "…" : ""}${clean.slice(start, end).trim()}${end < clean.length ? "…" : ""}`;
}
