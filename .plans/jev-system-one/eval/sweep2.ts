const out = await Bun.file(new URL("./results-combined.json", import.meta.url).pathname).json();
const band = (o: any, T: number, g: number) =>
  o.strict >= 0.65 && o.explicit === "explicit" && o.reveals2 >= g ? "auto"
  : (o.strict >= 0.5 && o.reveals2 >= g) || o.reveals2 >= T ? "pending" : "drop";
for (const T of [0.55, 0.6, 0.65]) for (const g of [0.4, 0.5, 0.6]) {
  const miss = out.filter((o: any) => !o.accept.includes(band(o, T, g)));
  console.log(`T=${T} guard=${g}: ${out.length - miss.length}/${out.length}  ${miss.map((o: any) => `${o.id}->${band(o, T, g)}`).join(" ")}`);
}
const T = 0.6, g = 0.5;
const neg = out.filter((o: any) => o.accept.length === 1 && o.accept[0] === "drop");
console.log("reveals2 on must-drop cases: max", Math.max(...neg.map((o: any) => o.reveals2)).toFixed(2), neg.sort((a: any, b: any) => b.reveals2 - a.reveals2).slice(0, 5).map((o: any) => `${o.id}:${o.reveals2.toFixed(2)}`).join(" "));
const pos = out.filter((o: any) => !o.accept.includes("drop"));
console.log("reveals2 on must-keep cases: min", Math.min(...pos.map((o: any) => o.reveals2)).toFixed(2), pos.sort((a: any, b: any) => a.reveals2 - b.reveals2).slice(0, 5).map((o: any) => `${o.id}:${o.reveals2.toFixed(2)}`).join(" "));
console.log("\n| ID | Expected | strict | reveals v2 | explicitness | Band (T=0.6, guard=0.5) |\n|---|---|---|---|---|---|");
for (const o of out) { const b = band(o, T, g); console.log(`| ${o.id} | ${o.accept.join("/")} | ${o.strict.toFixed(2)} | ${o.reveals2.toFixed(2)} | ${o.explicit} | ${b}${o.accept.includes(b) ? "" : " ✗"} |`); }
