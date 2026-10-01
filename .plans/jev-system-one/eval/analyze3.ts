// Analyse round 3. Prints markdown sections used in the report.
const { results } = await Bun.file(new URL("./results3.json", import.meta.url).pathname).json();
const ok = (r: any) => r.got === r.expect || (r.accept ?? []).includes(r.got);
const keep = (b: string) => b !== "drop";
const pct = (n: number, d: number) => `${n}/${d} (${Math.round((100 * n) / d)}%)`;
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/```/g, "`");
const out: string[] = [];
const p = (s = "") => out.push(s);

const N = results.length;
p(`## Headline`);
p(`| Metric | Result |`);
p(`|---|---|`);
p(`| Exact band match | ${pct(results.filter((r: any) => r.got === r.expect).length, N)} |`);
p(`| Acceptable (exact or listed alternative) | ${pct(results.filter(ok).length, N)} |`);
const posExp = results.filter((r: any) => keep(r.expect));
const negExp = results.filter((r: any) => !keep(r.expect));
const tp = posExp.filter((r: any) => keep(r.got)).length;
const fp = negExp.filter((r: any) => keep(r.got) && !ok(r)).length;
const fn = posExp.filter((r: any) => !keep(r.got) && !ok(r)).length;
p(`| Keep-vs-drop recall (should keep → kept) | ${pct(tp, posExp.length)} |`);
p(`| Keep-vs-drop: should-drop cases kept (unacceptably) | ${pct(fp, negExp.length)} |`);
const autos = results.filter((r: any) => r.got === "auto");
const badAuto = autos.filter((r: any) => !ok(r));
p(`| Auto-activations that were wrong | ${pct(badAuto.length, autos.length)} |`);
const expAuto = results.filter((r: any) => r.expect === "auto");
p(`| Explicit asks that auto-activated | ${pct(expAuto.filter((r: any) => r.got === "auto").length, expAuto.length)} |`);
const ms = results.map((r: any) => r.ms).sort((a: number, b: number) => a - b);
p(`| Latency p50 / p95 / max | ${ms[Math.floor(N * 0.5)]} / ${ms[Math.floor(N * 0.95)]} / ${ms[N - 1]} ms |`);
const tok = results.map((r: any) => r.tokens.input_tokens).sort((a: number, b: number) => a - b);
p(`| Input tokens p50 | ${tok[Math.floor(N / 2)]} |`);
p();

p(`## Confusion matrix (rows = expected, columns = Jev)`);
p(`| expected ↓ / got → | auto | pending | drop |`);
p(`|---|---|---|---|`);
for (const e of ["auto", "pending", "drop"]) {
  const row = results.filter((r: any) => r.expect === e);
  p(`| **${e}** (${row.length}) | ${["auto", "pending", "drop"].map((g) => row.filter((r: any) => r.got === g).length).join(" | ")} |`);
}
p();

const errs = results.filter((r: any) => !ok(r));
const cls = (r: any) =>
  r.got === "auto" ? "1. Wrong auto-activation (silently changes behaviour)"
  : r.got === "pending" && r.expect === "drop" ? "2. False pending card (costs user attention)"
  : r.got === "drop" ? "3. Missed memory (lost, user can re-teach)"
  : "4. Under-activated (explicit ask → pending card; safe)";
p(`## Errors by severity (outside the acceptable set)`);
p(`| Severity | Count |`);
p(`|---|---|`);
for (const k of [...new Set(errs.map(cls))].sort()) p(`| ${k} | ${errs.filter((r: any) => cls(r) === k).length} |`);
p();

const groupTable = (key: string, title: string, order?: string[]) => {
  p(`## By ${title}`);
  p(`| ${title} | Cases | Acceptable | Exact | Errors |`);
  p(`|---|---|---|---|---|`);
  const keys = order ?? [...new Set(results.map((r: any) => r[key]))];
  for (const k of keys) {
    const g = results.filter((r: any) => r[key] === k);
    p(`| ${k} | ${g.length} | ${pct(g.filter(ok).length, g.length)} | ${pct(g.filter((r: any) => r.got === r.expect).length, g.length)} | ${g.filter((r: any) => !ok(r)).map((r: any) => r.id).join(", ") || "—"} |`);
  }
  p();
};
groupTable("cat", "category");
groupTable("diff", "difficulty", ["easy", "medium", "hard"]);

p(`## Score separation (reveals)`);
const hist = (xs: number[]) => {
  const b = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const x of xs) b[Math.min(9, Math.floor(x * 10))]++;
  return b;
};
const hk = hist(posExp.map((r: any) => r.reveals)), hd = hist(negExp.map((r: any) => r.reveals));
p(`| reveals bucket | should keep | should drop |`);
p(`|---|---|---|`);
for (let i = 0; i < 10; i++) p(`| ${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)} | ${hk[i] || ""} | ${hd[i] || ""} |`);
p();

p(`## Post-hoc threshold check (NOT used for the headline — for tuning only)`);
p(`| pending T | guard | Acceptable |`);
p(`|---|---|---|`);
for (const T of [0.5, 0.6, 0.7]) for (const g of [0.4, 0.5, 0.6]) {
  const b = (r: any) => r.strict >= 0.65 && r.explicit === "explicit" && r.reveals >= g ? "auto" : (r.strict >= 0.5 && r.reveals >= g) || r.reveals >= T ? "pending" : "drop";
  p(`| ${T} | ${g} | ${pct(results.filter((r: any) => r.expect === b(r) || (r.accept ?? []).includes(b(r))).length, N)} |`);
}
p();

p(`## Every error`);
p(`| ID | Category | Diff | Prev assistant | User message | Expected | Got | strict | reveals | explicitness | Severity |`);
p(`|---|---|---|---|---|---|---|---|---|---|---|`);
for (const r of errs) p(`| ${r.id} | ${r.cat} | ${r.diff} | ${r.prev ? esc(r.prev) : "—"} | ${esc(r.user)} | ${[r.expect, ...(r.accept ?? [])].join("/")} | **${r.got}** | ${r.strict.toFixed(2)} | ${r.reveals.toFixed(2)} | ${r.explicit} | ${cls(r).slice(3)} |`);
p();

p(`## All 100 cases`);
p(`| ID | Category | Diff | User message | Expected | Got | strict | reveals | explicitness | |`);
p(`|---|---|---|---|---|---|---|---|---|---|`);
for (const r of results) p(`| ${r.id} | ${r.cat} | ${r.diff} | ${esc(r.user)}${r.prev ? ` _(prev: ${esc(r.prev)})_` : ""} | ${[r.expect, ...(r.accept ?? [])].join("/")} | ${r.got} | ${r.strict.toFixed(2)} | ${r.reveals.toFixed(2)} | ${r.explicit} | ${ok(r) ? "✓" : "✗"} |`);

await Bun.write(new URL("./round3.md", import.meta.url).pathname, out.join("\n"));
console.log(out.slice(0, out.indexOf("## Every error")).join("\n"));
