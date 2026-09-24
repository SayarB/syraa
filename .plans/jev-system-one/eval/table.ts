const { results } = await Bun.file(new URL("./results.json", import.meta.url).pathname).json();
const band = (r:any) => r.p>=0.65 && r.explicitness.choice==="explicit" ? "auto" : r.p>=0.5 ? "pending" : "drop";
const esc = (s:string) => s.replace(/\|/g,"\\|").replace(/\n/g," ").replace(/```\w*/g,"`");
console.log("| ID | Group | Prev assistant | User message | Expected | p(durable) | Explicitness | Kind (Jev / exp.) | Self-contained p | Band @0.85 | Band @0.65 | Regex today |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  const b2 = band(r);
  console.log(`| ${r.id} | ${r.group} | ${r.prev?esc(r.prev):"—"} | ${esc(r.user)} | ${r.accept.join("/")} | ${r.p.toFixed(2)} | ${r.explicitness.choice} | ${r.kindAns.choice} / ${r.kind??"—"} | ${r.selfP.toFixed(2)} | ${r.band}${r.pass?"":" ✗"} | ${b2}${r.accept.includes(b2)?"":" ✗"} | ${r.regex} |`);
}
