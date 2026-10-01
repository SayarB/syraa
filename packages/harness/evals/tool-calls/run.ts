/**
 * Live eval: does the Syraa agent make unnecessary tool calls? (calls the chat model — not part of
 * `npm run test`; CI runs it as its own job.)
 *   npm run eval:tool-calls -w @syraa/harness
 * Runs the SHIPPED agent (instructions, processors, turn system prompt with the materials overview)
 * against fixed fixtures: tools are stubs with the real ids, descriptions and input schemas, and
 * storage is in memory — no Postgres, no product memory, no context store.
 * Never traced: the agent runs outside the Mastra instance (no observability) and Langfuse env
 * vars are cleared, so eval runs can't reach Langfuse.
 *
 * Each case runs EVAL_RUNS times (default 3) and passes when at least EVAL_MIN_PASSING runs
 * (default 2/3 of runs, rounded up) meet its checks. Exits 1 if any case fails.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InMemoryStore } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { config } from "dotenv";
import { createSyraaAgent } from "../../src/mastra/agents/syraa-agent.js";
import { createSyraaMemory } from "../../src/mastra/memory.js";
import { buildSystemPrompt, formatMaterialsOutline } from "../../src/mastra/prompt.js";
import {
  listMaterialsTool,
  readMaterialsSectionTool,
  searchMaterialsTool,
} from "../../src/mastra/tools/materials-tools.js";
import { getMyMemoryTool } from "../../src/mastra/tools/memory-tools.js";

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
for (const key of Object.keys(process.env)) {
  if (key.startsWith("LANGFUSE_")) delete process.env[key];
}

const RUNS = Number(process.env.EVAL_RUNS) || 3;
const MIN_PASSING = Number(process.env.EVAL_MIN_PASSING) || Math.ceil((RUNS * 2) / 3);
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY) || 4;
/** Same step cap as a chat turn. */
const MAX_STEPS = 50;
/** Never acceptable in a reply, whatever the case. */
const BANNED_REPLY_TEXT = ["updateWorkingMemory", "working memory updated"];

type MemoryEntry = { type: string; text: string; status: "active" | "pending" };
type Fixture = {
  materials: { name: string; sections: { title: string; text: string }[] }[];
  memory: MemoryEntry[];
};
type EvalCase = {
  id: string;
  group: string;
  fixture: string;
  user: string;
  history?: { role: "user" | "assistant"; content: string }[];
  /** Total tool calls allowed in the turn. */
  maxCalls: number;
  /** Each must be called at least once. */
  require?: string[];
  /** At least one of these must be called. */
  requireAny?: string[];
  forbid?: string[];
};
type ToolCall = { tool: string; args: string };
type RunResult = { calls: ToolCall[]; reply: string; failures: string[] };

const { fixtures, cases } = JSON.parse(
  readFileSync(fileURLToPath(new URL("./cases.json", import.meta.url)), "utf8"),
) as { fixtures: Record<string, Fixture>; cases: EvalCase[] };

const only = process.env.EVAL_CASES?.split(",").map((id) => id.trim());
const selected = only ? cases.filter((c) => only.includes(c.id)) : cases;

function matches(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase().trim());
}

/** Stubs answer from the fixture with the real tools' result shapes, and log every call. */
function stubTools(fixture: Fixture, calls: ToolCall[]) {
  const record = (tool: string, args: unknown) =>
    calls.push({ tool, args: JSON.stringify(args ?? {}) });
  const findDoc = (name: string) =>
    fixture.materials.find((doc) => matches(doc.name, name) || matches(name, doc.name));

  return {
    search_materials: createTool({
      id: searchMaterialsTool.id,
      description: searchMaterialsTool.description,
      inputSchema: searchMaterialsTool.inputSchema,
      execute: async (input) => {
        record("search_materials", input);
        const words = input.query.split(/\s+/).filter((word) => word.length > 2);
        const hits = fixture.materials
          .filter((doc) => !input.documentName || findDoc(input.documentName) === doc)
          .flatMap((doc) =>
            doc.sections
              .filter((s) => words.some((w) => matches(`${doc.name} ${s.title} ${s.text}`, w)))
              .map((s) => ({
                documentName: doc.name,
                section: s.title,
                snippet: s.text,
                score: 0.9,
                exactMatch: true,
              })),
          )
          .slice(0, input.limit ?? 8);
        return hits.length > 0
          ? { query: input.query, hits }
          : {
              query: input.query,
              hits,
              note: `No passage in the user's materials mentions "${input.query}".`,
            };
      },
    }),
    list_materials: createTool({
      id: listMaterialsTool.id,
      description: listMaterialsTool.description,
      inputSchema: listMaterialsTool.inputSchema,
      execute: async (input) => {
        record("list_materials", input);
        return {
          materials: fixture.materials.map((doc, index) => ({
            documentName: doc.name,
            resourceId: `res-${index}`,
            status: "ready",
            summary: null,
            sectionTitles: doc.sections.map((s) => s.title),
          })),
        };
      },
    }),
    read_materials_section: createTool({
      id: readMaterialsSectionTool.id,
      description: readMaterialsSectionTool.description,
      inputSchema: readMaterialsSectionTool.inputSchema,
      execute: async (input) => {
        record("read_materials_section", input);
        const doc = findDoc(input.documentName);
        if (!doc) {
          return {
            error: `No ingested document matching "${input.documentName}".`,
            availableDocuments: fixture.materials.map((d) => d.name),
          };
        }
        if (!input.sectionTitle) {
          return {
            document: doc.name,
            section: "(entire document)",
            text: doc.sections.map((s) => `${s.title}\n${s.text}`).join("\n\n"),
            truncated: false,
            chunkCount: doc.sections.length,
          };
        }
        const title = input.sectionTitle;
        const section = doc.sections.find(
          (s) => matches(s.title, title) || matches(title, s.title),
        );
        if (!section) {
          return {
            error: `Section not found: "${title}"`,
            document: doc.name,
            topSections: doc.sections.map((s) => s.title),
          };
        }
        return { document: doc.name, section: section.title, text: section.text, truncated: false };
      },
    }),
    get_my_memory: createTool({
      id: getMyMemoryTool.id,
      description: getMyMemoryTool.description,
      inputSchema: getMyMemoryTool.inputSchema,
      execute: async (input) => {
        record("get_my_memory", input);
        const entries = (status: MemoryEntry["status"]) =>
          fixture.memory
            .filter((m) => m.status === status)
            .map(({ type, text }) => ({ type, text }));
        return {
          active: entries("active"),
          pendingConfirmation: entries("pending"),
          note: "This is the complete record. Anything not listed here is not remembered, even if an earlier reply in this thread said otherwise.",
        };
      },
    }),
  };
}

function check(c: EvalCase, calls: ToolCall[], reply: string): string[] {
  const failures: string[] = [];
  const called = (tool: string) => calls.some((call) => call.tool === tool);

  if (calls.length > c.maxCalls) failures.push(`${calls.length} tool calls (max ${c.maxCalls})`);
  const seen = new Set<string>();
  for (const call of calls) {
    const key = `${call.tool}(${call.args})`;
    if (seen.has(key)) failures.push(`repeated ${key}`);
    seen.add(key);
  }
  for (const tool of c.require ?? []) {
    if (!called(tool)) failures.push(`did not call ${tool}`);
  }
  if (c.requireAny && !c.requireAny.some(called)) {
    failures.push(`called none of ${c.requireAny.join(", ")}`);
  }
  for (const tool of c.forbid ?? []) {
    if (called(tool)) failures.push(`called ${tool}`);
  }
  if (!reply.trim()) failures.push("empty reply");
  for (const banned of BANNED_REPLY_TEXT) {
    if (matches(reply, banned)) failures.push(`reply contains "${banned}"`);
  }
  return failures;
}

async function runOnce(c: EvalCase): Promise<RunResult> {
  const fixture = fixtures[c.fixture];
  if (!fixture) throw new Error(`${c.id}: unknown fixture "${c.fixture}"`);

  const calls: ToolCall[] = [];
  const memory = createSyraaMemory(new InMemoryStore());
  const agent = createSyraaAgent({ tools: stubTools(fixture, calls), memory });
  const threadId = `eval-${c.id}-${randomUUID()}`;
  const resourceId = "eval-user";
  const outline = fixture.materials.map((doc, index) => ({
    resourceId: `res-${index}`,
    name: doc.name,
    status: "ready",
    sectionTitles: doc.sections.map((s) => s.title),
    // Fixtures have no AI summaries, so the overview falls back to section titles.
    summary: null,
  }));

  // As in production: the thread exists; the materials overview lives in the system prompt.
  await memory.createThread({ threadId, resourceId });

  const memoryItems = fixture.memory
    .filter((m) => m.status === "active")
    .map((m) => ({ type: m.type, text: m.text }));
  const output = await agent.generate(
    [
      ...(c.history ?? []).map(({ role, content }) =>
        role === "user"
          ? { role: "user" as const, content }
          : { role: "assistant" as const, content },
      ),
      { role: "user" as const, content: c.user },
    ],
    {
      memory: { thread: threadId, resource: resourceId },
      instructions: buildSystemPrompt(
        memoryItems as Parameters<typeof buildSystemPrompt>[0],
        formatMaterialsOutline(outline as Parameters<typeof formatMaterialsOutline>[0]),
      ),
      maxSteps: MAX_STEPS,
      modelSettings: { temperature: 0.4, maxOutputTokens: 2048 },
    },
  );

  // A call to a tool that doesn't exist never reaches a stub; count it from the steps.
  for (const step of output.steps ?? []) {
    for (const call of (step.toolCalls ?? []) as unknown[]) {
      const name = toolNameOf(call);
      if (
        name &&
        !["search_materials", "list_materials", "read_materials_section", "get_my_memory"].includes(
          name,
        )
      ) {
        calls.push({ tool: name, args: "(unknown tool)" });
      }
    }
  }

  // Raw model text (before output processors clean it): what a streaming user saw live.
  const reply = (output.steps ?? []).map(rawStepText).join("\n") || output.text || "";
  return { calls, reply, failures: check(c, calls, reply) };
}

function rawStepText(step: { text?: string; content?: unknown }): string {
  if (!Array.isArray(step.content)) return step.text ?? "";
  return (step.content as { type?: string; text?: string }[])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

function toolNameOf(call: unknown): string | undefined {
  const c = call as { toolName?: string; payload?: { toolName?: string } };
  return c.toolName ?? c.payload?.toolName;
}

async function runWithRetry(c: EvalCase): Promise<RunResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runOnce(c);
    } catch (error) {
      if (attempt >= 3) {
        const message = error instanceof Error ? error.message : String(error);
        return { calls: [], reply: "", failures: [`error: ${message}`] };
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

const jobs = selected.flatMap((c) => Array.from({ length: RUNS }, () => c));
const results = new Map<string, RunResult[]>(selected.map((c) => [c.id, []]));
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let c = jobs.shift(); c; c = jobs.shift()) {
      results.get(c.id)?.push(await runWithRetry(c));
    }
  }),
);

const lines: string[] = [];
const perTool = new Map<string, number>();
let failedCases = 0;
let totalCalls = 0;

lines.push("| case | group | passing runs | calls per run | max allowed |");
lines.push("| --- | --- | --- | --- | --- |");
for (const c of selected) {
  const runs = results.get(c.id) ?? [];
  const passing = runs.filter((r) => r.failures.length === 0).length;
  if (passing < MIN_PASSING) failedCases++;
  for (const run of runs) {
    totalCalls += run.calls.length;
    for (const call of run.calls) perTool.set(call.tool, (perTool.get(call.tool) ?? 0) + 1);
  }
  const counts = runs.map((r) => r.calls.length).join(", ");
  const mark = passing >= MIN_PASSING ? "" : " ❌";
  lines.push(
    `| ${c.id}${mark} | ${c.group} | ${passing}/${runs.length} | ${counts} | ${c.maxCalls} |`,
  );
}

const runCount = selected.length * RUNS;
lines.push("");
lines.push(
  `Tool calls: ${totalCalls} over ${runCount} runs (${(totalCalls / runCount).toFixed(2)} per run)`,
);
lines.push(
  `By tool: ${[...perTool.entries()].map(([tool, n]) => `${tool} ${n}`).join(", ") || "none"}`,
);

const failedRuns = selected.flatMap((c) =>
  (results.get(c.id) ?? []).filter((r) => r.failures.length > 0).map((r) => ({ c, r })),
);
if (failedRuns.length > 0) {
  lines.push("", "Failed runs:");
  for (const { c, r } of failedRuns) {
    const sequence = r.calls.map((call) => `${call.tool}(${call.args})`).join(" → ") || "no calls";
    lines.push(`- ${c.id}: ${r.failures.join("; ")} — ${sequence}`);
    lines.push(`  reply: ${r.reply.slice(0, 160).replace(/\s+/g, " ")}`);
  }
}

const pass = failedCases === 0;
lines.push(
  "",
  `${pass ? "PASS" : "FAIL"}: ${selected.length - failedCases}/${selected.length} cases (bar: ≥ ${MIN_PASSING}/${RUNS} passing runs per case)`,
);

const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Agent tool-call eval\n\n${report}\n`);
}
process.exit(pass ? 0 : 1);
