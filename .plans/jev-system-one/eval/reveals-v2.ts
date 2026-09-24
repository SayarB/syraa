// Reveals v2 (adds decisions by the user or their team) across round 1 + round 2, then scores combined band rules.
import { cases } from "./cases.ts";
import { cases2 } from "./cases2.ts";
const KEY = process.env.TYPESAFE_API_KEY!;
const REVEALS_V2 = {
  type: "noul",
  instructions:
    "Setting the main request aside: does the message reveal, even in passing, something lasting that should carry over to future, unrelated conversations — a fact about the user, a standing preference about how they want the assistant to work (including one implied by a complaint or repeated correction), or a decision the user or their team has made about their tools, stack, or way of working? Facts only about this one task, temporary situations, other people's preferences, hypotheticals, or quoted text from someone else do not count.",
  criteria: {
    true: "Something lasting about the user, how they want help, or a decision they or their team made, that should carry over to future conversations.",
    false: "Everything is specific to this task, temporary, hypothetical, about someone else, or quoted.",
  },
};
const r1 = (await Bun.file(new URL("./results.json", import.meta.url).pathname).json()).results;
const r2 = (await Bun.file(new URL("./results2.json", import.meta.url).pathname).json()).results;
const all = [
  ...cases.map((c) => { const x = r1.find((r: any) => r.id === c.id); return { id: c.id, prev: c.prev, user: c.user, accept: c.accept, strict: x.p, explicit: x.explicitness.choice }; }),
  ...cases2.map((c) => { const x = r2.find((r: any) => r.id === c.id); return { id: c.id, prev: c.prev, user: c.user, accept: c.accept, strict: x.strict, explicit: x.explicitness.choice }; }),
];
const out = await Promise.all(all.map(async (c) => {
  const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state: `Previous assistant message: ${c.prev ?? "(none — start of conversation)"}\nUser message: ${c.user}`, questions: { reveals: REVEALS_V2 } }) });
  const b: any = await res.json();
  return { ...c, reveals2: b.answers.reveals.noul as number };
}));
await Bun.write(new URL("./results-combined.json", import.meta.url).pathname, JSON.stringify(out, null, 2));
const band = (o: any, T: number, guard: number) =>
  o.strict >= 0.65 && o.explicit === "explicit" && o.reveals2 >= guard ? "auto"
  : (o.strict >= 0.5 && o.reveals2 >= guard) || o.reveals2 >= T ? "pending" : "drop";
for (const T of [0.5, 0.6, 0.7]) for (const guard of [0, 0.3]) {
  const miss = out.filter((o) => !o.accept.includes(band(o, T, guard)));
  console.log(`T=${T} guard=${guard}: ${out.length - miss.length}/${out.length}  ${miss.map((o) => `${o.id}->${band(o, T, guard)}`).join(" ")}`);
}
for (const id of ["B4","S6","N7","D2","D3","H4","J3","N8","R6","S10","I1"]) { const o = out.find((x) => x.id === id)!; console.log(id, "strict", o.strict.toFixed(2), "reveals2", o.reveals2.toFixed(2), o.explicit); }
