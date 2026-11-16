/** A chat message reduced to what compaction and recall need: who said it and the text. */
export type HistoryMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** ISO timestamp, when known. */
  createdAt?: string;
};

/** One user message and the replies that follow it. Turns are numbered from 0. */
export type Turn = {
  index: number;
  messages: HistoryMessage[];
};

/**
 * Groups messages (oldest first) into turns. A new turn starts at every user message; replies
 * that come before any user message form turn 0 on their own.
 */
export function splitTurns(messages: readonly HistoryMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    const current = turns.at(-1);
    if (message.role === "user" || !current) {
      turns.push({ index: turns.length, messages: [message] });
    } else {
      current.messages.push(message);
    }
  }
  return turns;
}

/** 1-based position of every message in the list; the same numbering `thread_history` reports. */
export function positionsById(messages: readonly HistoryMessage[]): Map<string, number> {
  return new Map(messages.map((message, index) => [message.id, index + 1]));
}
