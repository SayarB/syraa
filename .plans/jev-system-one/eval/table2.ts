const r2 = (await Bun.file(new URL("./results2.json", import.meta.url).pathname).json()).results;
const comb = await Bun.file(new URL("./results-combined.json", import.meta.url).pathname).json();
const band = (o: any) => o.strict >= 0.65 && o.explicit === "explicit" && o.reveals2 >= 0.5 ? "auto" : (o.strict >= 0.5 && o.reveals2 >= 0.5) || o.reveals2 >= 0.6 ? "pending" : "drop";
const esc = (s: string) => s.replace(/\|/g, "\\|");
console.log("| ID | Group | Prev assistant | User message (aside in **bold**) | Expected | strict | reveals v1 | reveals v2 | Band | Top-scoring sentence |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const r of r2) {
  const o = comb.find((x: any) => x.id === r.id); const b = band(o);
  let msg = esc(r.user);
  if (r.plant) { const s = r.perSentence.find((x: any) => x.s.includes(r.plant))?.s; if (s) msg = msg.replace(esc(s), `**${esc(s)}**`); }
  const top = r.perSentence.slice().sort((a: any, b: any) => b.p - a.p)[0];
  console.log(`| ${r.id} | ${r.group} | ${r.prev ? esc(r.prev) : "—"} | ${msg} | ${r.accept.join("/")} | ${r.strict.toFixed(2)} | ${r.reveals.toFixed(2)} | ${o.reveals2.toFixed(2)} | ${b}${r.accept.includes(b) ? "" : " ✗"} | ${r.plant ? `${top.p.toFixed(2)} “${esc(top.s)}”${r.topHitsPlant ? "" : " (not the planted line)"}` : "—"} |`);
}
