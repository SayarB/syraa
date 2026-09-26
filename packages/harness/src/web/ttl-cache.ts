/** Small in-process cache with a TTL and a size cap (oldest entries evicted first). */
export function createTtlCache<T>(opts: { ttlMs: number; maxEntries: number }) {
  const entries = new Map<string, { expires: number; value: T }>();

  return {
    get(key: string): T | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },

    set(key: string, value: T): void {
      entries.delete(key);
      entries.set(key, { expires: Date.now() + opts.ttlMs, value });
      // Map keeps insertion order: evict the oldest entries past the cap.
      while (entries.size > opts.maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },

    clear(): void {
      entries.clear();
    },
  };
}
