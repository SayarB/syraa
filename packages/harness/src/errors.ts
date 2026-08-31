export function formatHarnessError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("FIREWORKS_API_KEY") || message.includes("OPENAI_API_KEY")) {
    return message;
  }
  if (message.includes("Cannot connect to Postgres")) {
    return message;
  }
  if (message.includes("ECONNREFUSED") || message.includes("connect ETIMEDOUT")) {
    return "Cannot reach Postgres. Start it with: npm run db:up";
  }
  if (message.includes('relation "memories" does not exist')) {
    return "Memory tables missing. Run: npm run db:migrate (or restart the API — it migrates on boot)";
  }
  if (message.startsWith("Failed query:")) {
    return `Database error. Is Postgres running and migrated? (${message.split("\n")[0]})`;
  }
  return message;
}
