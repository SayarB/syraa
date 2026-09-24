/**
 * Older threads stored the reply as `{ message, lessons }` JSON: surface only `message` for those.
 * Any other text (including a reply that is itself JSON) is shown as is.
 */
export function extractTurnMessage(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (isLegacyTurn(parsed)) return parsed.message.trim();
  } catch {
    // not JSON (or a partial reply while streaming): plain text
  }
  return trimmed;
}

function isLegacyTurn(value: unknown): value is { message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.message === "string" &&
    Object.keys(record).every((key) => key === "message" || key === "lessons")
  );
}
