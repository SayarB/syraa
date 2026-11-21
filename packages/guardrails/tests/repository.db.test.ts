import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createGuardrailDbFromUrl, type GuardrailDb } from "../src/db/client.js";
import type { NewVerdict } from "../src/repository.js";
import { createGuardrailRepository, type GuardrailRepository } from "../src/repository.js";

const hasDb = Boolean(process.env.DATABASE_URL);

function verdict(overrides: Partial<NewVerdict> = {}): NewVerdict {
  return {
    guard: "message",
    subjectKind: "message",
    subjectId: "m1",
    userId: "u1",
    threadId: "t1",
    state: "clean",
    categories: [],
    answers: { jailbreak: 0.1 },
    model: "jev-latest",
    error: null,
    subjectText: null,
    ...overrides,
  };
}

describe.skipIf(!hasDb)("guardrail repository", () => {
  let db: GuardrailDb;
  let repo: GuardrailRepository;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const handle = await createGuardrailDbFromUrl();
    db = handle.db;
    close = () => handle.pool.end();
    repo = createGuardrailRepository(db);
  });

  afterEach(async () => {
    await db.execute(sql`DELETE FROM guardrail_verdicts`);
  });

  afterAll(async () => {
    await close();
  });

  it("stores message text only for flagged rows", async () => {
    await repo.record(
      verdict({ state: "flagged", categories: ["jailbreak"], subjectText: "ignore it all" }),
    );
    const [row] = await repo.listFlagged();
    expect(row.subjectText).toBe("ignore it all");
    expect(row.categories).toEqual(["jailbreak"]);

    for (const state of ["clean", "unchecked"] as const) {
      await expect(repo.record(verdict({ state, subjectText: "hello" }))).rejects.toMatchObject({
        cause: { constraint: "guardrail_verdicts_text_only_flagged" },
      });
    }
  });

  it("rejects an unknown state", async () => {
    await expect(repo.record(verdict({ state: "weird" as "clean" }))).rejects.toMatchObject({
      cause: { constraint: "guardrail_verdicts_state_check" },
    });
  });

  it("lists flagged rows only, filtered by guard, user and time", async () => {
    await repo.record(verdict());
    await repo.record(verdict({ state: "unchecked", error: "jev HTTP 500" }));
    await repo.record(
      verdict({ state: "flagged", categories: ["abuse"], subjectText: "a", userId: "u1" }),
    );
    await repo.record(
      verdict({ state: "flagged", categories: ["abuse"], subjectText: "b", userId: "u2" }),
    );

    expect(await repo.listFlagged()).toHaveLength(2);
    expect(await repo.listFlagged({ userId: "u2" })).toHaveLength(1);
    expect(await repo.listFlagged({ guard: "document" })).toHaveLength(0);
    expect(
      await repo.listFlagged({ since: new Date(Date.now() + 60_000).toISOString() }),
    ).toHaveLength(0);
  });

  it("purges only verdict rows older than the retention window", async () => {
    await repo.record(verdict({ subjectId: "old" }));
    await repo.record(verdict({ subjectId: "recent" }));
    await db.execute(
      sql`UPDATE guardrail_verdicts SET created_at = now() - interval '91 days' WHERE subject_id = 'old'`,
    );
    await db.execute(
      sql`UPDATE guardrail_verdicts SET created_at = now() - interval '89 days' WHERE subject_id = 'recent'`,
    );

    // A neighbouring table with an equally old row must survive the purge.
    await db.execute(sql`CREATE TABLE IF NOT EXISTS guardrail_test_other (created_at timestamptz)`);
    await db.execute(sql`DELETE FROM guardrail_test_other`);
    await db.execute(sql`INSERT INTO guardrail_test_other VALUES (now() - interval '400 days')`);

    try {
      expect(await repo.purgeOlderThan(90)).toBe(1);

      const remaining = await db.execute(sql`SELECT subject_id FROM guardrail_verdicts`);
      expect(remaining.rows.map((r) => r.subject_id)).toEqual(["recent"]);
      const other = await db.execute(sql`SELECT count(*)::int AS n FROM guardrail_test_other`);
      expect(other.rows[0].n).toBe(1);
    } finally {
      await db.execute(sql`DROP TABLE IF EXISTS guardrail_test_other`);
    }
  });
});
