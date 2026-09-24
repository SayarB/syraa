/**
 * Opt-in live eval for the lesson gate (calls Jev — not part of `npm run test`).
 *   npm run eval:lesson-gate -w @syraa/harness
 * Uses the SHIPPED questions, band rule, and user-first decision (`evaluateTurn`) from
 * src/lesson-gate.ts, so any wording, threshold, or policy change is re-checked against the cases.
 * Exits 1 if acceptable < MIN_ACCEPTABLE or any wrong auto-activation.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { evaluateTurn, type LessonBand, stripCodeBlocks } from "../../src/lesson-gate.js";

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });

const MIN_ACCEPTABLE = 175;
const CONCURRENCY = 6;

type EvalCase = {
  id: string;
  round: number;
  group: string;
  prev?: string;
  user: string;
  expect: LessonBand;
  accept: LessonBand[];
};

type EvalResult = EvalCase & {
  got: LessonBand;
  source: "user" | "confirmation";
  ok: boolean;
  strict: number;
  reveals: number;
  explicitness: string;
};

const cases = JSON.parse(
  readFileSync(fileURLToPath(new URL("./cases.json", import.meta.url)), "utf8"),
) as EvalCase[];

async function evaluate(c: EvalCase): Promise<EvalResult> {
  const decision = await evaluateTurn(c.prev ?? null, stripCodeBlocks(c.user));
  const scores = {
    strict: decision.answers.strict,
    reveals: decision.answers.reveals,
    explicitness: decision.answers.explicitness,
  };
  const got = decision.band;
  return {
    ...c,
    ...scores,
    got,
    source: decision.source,
    ok: got === c.expect || c.accept.includes(got),
  };
}

async function evaluateWithRetry(c: EvalCase): Promise<EvalResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await evaluate(c);
    } catch (error) {
      if (attempt >= 3)
        throw new Error(`${c.id}: ${error instanceof Error ? error.message : error}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

const results: EvalResult[] = [];
const queue = [...cases];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      results.push(await evaluateWithRetry(c));
    }
  }),
);
results.sort(
  (a, b) =>
    cases.indexOf(cases.find((c) => c.id === a.id)!) -
    cases.indexOf(cases.find((c) => c.id === b.id)!),
);

const count = (rows: EvalResult[], pred: (r: EvalResult) => boolean) => rows.filter(pred).length;
const wrongAuto = results.filter((r) => r.got === "auto" && !r.ok);

console.log("round | cases | acceptable | exact | wrong auto");
for (const round of [...new Set(results.map((r) => r.round))]) {
  const rows = results.filter((r) => r.round === round);
  console.log(
    `${round} | ${rows.length} | ${count(rows, (r) => r.ok)} | ${count(rows, (r) => r.got === r.expect)} | ${count(rows, (r) => r.got === "auto" && !r.ok)}`,
  );
}
const acceptable = count(results, (r) => r.ok);
console.log(
  `total | ${results.length} | ${acceptable} | ${count(results, (r) => r.got === r.expect)} | ${wrongAuto.length}`,
);

const misses = results.filter((r) => !r.ok);
if (misses.length) {
  console.log("\nmisses:");
  for (const r of misses) {
    console.log(
      `${r.id} (${r.group}) expected ${[r.expect, ...r.accept].join("/")} got ${r.got} via ${r.source} — strict ${r.strict.toFixed(2)} reveals ${r.reveals.toFixed(2)} ${r.explicitness} — ${r.user.slice(0, 90).replace(/\n/g, " ")}`,
    );
  }
}

const pass = acceptable >= MIN_ACCEPTABLE && wrongAuto.length === 0;
console.log(
  `\n${pass ? "PASS" : "FAIL"} (bar: ≥ ${MIN_ACCEPTABLE}/${results.length} acceptable, 0 wrong auto)`,
);
process.exit(pass ? 0 : 1);
