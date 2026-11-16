import type { HistoryMessage } from "./turns.js";

/** A stored message with its 1-based position in the thread. */
export type RecalledMessage = HistoryMessage & { position: number };

export type MessageHit = {
  id: string;
  position: number;
  role: "user" | "assistant";
  at?: string;
  text: string;
  /** True when `text` is shorter than the stored message. */
  truncated: boolean;
};

export type SearchOptions = {
  /** Words to look for. Omit to list messages by date alone. */
  query?: string;
  role?: "user" | "assistant";
  order?: "oldest" | "newest";
  limit?: number;
  /** Longest text returned per hit. */
  snippetChars?: number;
  /** Skip messages for which this is true (e.g. the question being answered right now). */
  exclude?: (message: RecalledMessage) => boolean;
};

export const DEFAULT_SEARCH_LIMIT = 5;
export const DEFAULT_SNIPPET_CHARS = 700;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "about",
  "as",
  "at",
  "be",
  "by",
  "did",
  "do",
  "for",
  "from",
  "had",
  "has",
  "have",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "said",
  "say",
  "that",
  "the",
  "this",
  "to",
  "was",
  "we",
  "what",
  "when",
  "which",
  "with",
  "you",
  "your",
]);

/** Lower-cased words worth matching on. Falls back to every word when the query is all filler. */
export function queryTerms(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2);
  const meaningful = words.filter((word) => !STOPWORDS.has(word));
  return [...new Set(meaningful.length > 0 ? meaningful : words)];
}

function snippetOf(
  text: string,
  focus: number,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  const start = Math.max(0, Math.min(focus - Math.floor(maxChars / 3), text.length - maxChars));
  const end = start + maxChars;
  const body = text.slice(start, end).trim();
  return { text: `${start > 0 ? "…" : ""}${body}${end < text.length ? "…" : ""}`, truncated: true };
}

function toHit(message: RecalledMessage, focus: number, maxChars: number): MessageHit {
  const { text, truncated } = snippetOf(message.text, focus, maxChars);
  return {
    id: message.id,
    position: message.position,
    role: message.role,
    ...(message.createdAt ? { at: message.createdAt } : {}),
    text,
    truncated,
  };
}

/**
 * Finds messages in one thread. With a query, messages are ranked by how many of its words they
 * contain (a full-phrase match counts extra), ties broken by `order`. Without one, messages are
 * simply listed by date, so "my first message" and "my last message" work.
 */
export function searchMessages(
  messages: readonly RecalledMessage[],
  options: SearchOptions = {},
): { total: number; matched: number; hits: MessageHit[] } {
  const limit = Math.max(1, options.limit ?? DEFAULT_SEARCH_LIMIT);
  const maxChars = options.snippetChars ?? DEFAULT_SNIPPET_CHARS;
  const newestFirst = (options.order ?? "newest") === "newest";

  const candidates = messages.filter(
    (message) =>
      (!options.role || message.role === options.role) && !(options.exclude?.(message) ?? false),
  );

  const terms = options.query ? queryTerms(options.query) : [];
  const phrase = options.query?.trim().toLowerCase() ?? "";

  const scored = candidates
    .map((message) => {
      if (terms.length === 0) return { message, score: 0, focus: 0 };
      const lower = message.text.toLowerCase();
      const found = terms.filter((term) => lower.includes(term));
      const phraseAt = terms.length > 1 && phrase ? lower.indexOf(phrase) : -1;
      const score = found.length + (phraseAt >= 0 ? 1 : 0);
      const firstAt = found.length > 0 ? Math.min(...found.map((term) => lower.indexOf(term))) : 0;
      return { message, score, focus: phraseAt >= 0 ? phraseAt : firstAt };
    })
    .filter((entry) => terms.length === 0 || entry.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return newestFirst
      ? b.message.position - a.message.position
      : a.message.position - b.message.position;
  });

  return {
    total: messages.length,
    matched: scored.length,
    hits: scored.slice(0, limit).map((entry) => toHit(entry.message, entry.focus, maxChars)),
  };
}

export const MAX_WINDOW_AROUND = 3;
export const FOCUS_MESSAGE_CHARS = 6000;
export const NEIGHBOUR_MESSAGE_CHARS = 1500;

/** One message in full (up to a cap) with `around` messages on either side, or null if the id is unknown. */
export function getMessageWindow(
  messages: readonly RecalledMessage[],
  id: string,
  around = 0,
): MessageHit[] | null {
  const index = messages.findIndex((message) => message.id === id);
  if (index === -1) return null;
  const span = Math.min(Math.max(0, Math.floor(around)), MAX_WINDOW_AROUND);
  return messages
    .slice(Math.max(0, index - span), index + span + 1)
    .map((message) =>
      toHit(message, 0, message.id === id ? FOCUS_MESSAGE_CHARS : NEIGHBOUR_MESSAGE_CHARS),
    );
}
