// For round-4 positives: score each sentence with the frozen reveals question; does the planted line rank #1?
import { cases4 } from "./cases4.ts";
const KEY = process.env.TYPESAFE_API_KEY!;
const src = await Bun.file(new URL("./run3.ts", import.meta.url).pathname).text();
const QS = eval("(" + src.match(/const QUESTIONS = (\{[\s\S]*?\n\});/)![1] + ")");
const call = async (s: string) => {
  const r = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state: `Previous assistant message: (none — start of conversation)\nUser message: ${s}`, questions: { reveals: QS.reveals } }) });
  return ((await r.json()) as any).answers.reveals.noul as number;
};
const out: any[] = [];
for (const c of cases4.filter((c) => c.plant)) {
  const ss = c.user.split(/(?<=[.!?])\s+/).filter((s) => s.length > 3);
  const scored = await Promise.all(ss.map(async (s) => ({ s, p: await call(s) })));
  scored.sort((a, b) => b.p - a.p);
  const rank = scored.findIndex((x) => x.s.includes(c.plant!)) + 1;
  out.push({ id: c.id, sentences: ss.length, rank, plantP: scored[rank - 1].p, top: scored[0] });
  console.log(`${c.id} ${ss.length} sentences  planted rank=${rank} p=${scored[rank - 1].p.toFixed(2)}  top=${scored[0].p.toFixed(2)} "${scored[0].s.slice(0, 80)}"`);
}
await Bun.write(new URL("./span4.json", import.meta.url).pathname, JSON.stringify(out, null, 2));
