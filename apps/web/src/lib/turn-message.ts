/** Agent turns may stream `{ message, lessons }` JSON — surface only `message` in the UI. */
export function extractTurnMessage(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("{")) return trimmed;

  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown };
    if (typeof parsed.message === "string") return parsed.message.trim();
  } catch {
    // partial JSON while streaming
  }

  const keyMatch = /"message"\s*:\s*"/.exec(trimmed);
  if (!keyMatch) return "";

  let index = keyMatch.index + keyMatch[0].length;
  let output = "";
  while (index < trimmed.length) {
    const char = trimmed[index];
    if (char === "\\") {
      const next = trimmed[index + 1];
      if (next === "n") output += "\n";
      else if (next === "t") output += "\t";
      else if (next === '"') output += '"';
      else if (next === "\\") output += "\\";
      else if (next) output += next;
      index += 2;
      continue;
    }
    if (char === '"') break;
    output += char;
    index += 1;
  }

  return output.trim();
}
