import type { UIMessage } from "ai";

/**
 * Replace the streamed text of the last assistant message with the server's final reply.
 * displayMessage is the whole streamed reply with runtime footers stripped from the end (or a
 * fallback when nothing usable streamed).
 */
export function patchLastAssistantDisplayMessage(
  messages: UIMessage[],
  displayMessage: string,
): UIMessage[] {
  const next = [...messages];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index].role !== "assistant") continue;
    const parts = next[index].parts;
    const streamed = parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
    if (streamed.trim() === displayMessage) break;

    const lead = streamed.length - streamed.trimStart().length;
    const patched: UIMessage["parts"] = [];
    if (displayMessage && streamed.startsWith(displayMessage, lead)) {
      // Footer case: displayMessage is the streamed reply minus a trailing footer. Cut the tail,
      // keeping text parts in place (a text → tool → text turn keeps its pre-tool text).
      let keep = lead + displayMessage.length;
      for (const part of parts) {
        if (part.type !== "text") {
          patched.push(part);
          continue;
        }
        const text = part.text.slice(0, Math.max(0, keep));
        keep -= part.text.length;
        if (text.trim()) patched.push({ ...part, text, state: "done" });
      }
    } else {
      // Fallback case: nothing usable streamed, so show displayMessage once, after any tools.
      for (const part of parts) if (part.type !== "text") patched.push(part);
      patched.push({ type: "text", text: displayMessage, state: "done" });
    }
    next[index] = { ...next[index], parts: patched };
    break;
  }
  return next;
}
