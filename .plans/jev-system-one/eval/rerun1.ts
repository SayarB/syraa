// Adds the round-2 "reveals" question to the round-1 cases to test the combined rule.
import { cases } from "./cases.ts";
const KEY = process.env.TYPESAFE_API_KEY!;
const src = await Bun.file(new URL("./run2.ts", import.meta.url).pathname).text();
const REVEALS = eval("(" + src.match(/const REVEALS = (\{[\s\S]*?\n\});/)![1] + ")");
const r1 = (await Bun.file(new URL("./results.json", import.meta.url).pathname).json()).results;
const out = await Promise.all(cases.map(async (c) => {
  const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state: `Previous assistant message: ${c.prev ?? "(none — start of conversation)"}\nUser message: ${c.user}`, questions: { reveals: REVEALS } }) });
  const b: any = await res.json();
  const prev = r1.find((x: any) => x.id === c.id);
  return { id: c.id, accept: c.accept, strict: prev.p, explicitness: prev.explicitness.choice, reveals: b.answers.reveals.noul };
}));
await Bun.write(new URL("./results1-reveals.json", import.meta.url).pathname, JSON.stringify(out, null, 2));
for (const o of out) console.log(o.id, o.accept.join("/"), "strict", o.strict.toFixed(2), "reveals", o.reveals.toFixed(2), o.explicitness);
