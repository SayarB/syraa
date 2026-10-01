// Post-hoc: frozen rule vs "explicit ask never silently dropped" variant, on round 3 (held-out) and rounds 1+2.
const r3 = (await Bun.file(new URL("./results3.json", import.meta.url).pathname).json()).results
  .map((r: any) => ({ id: r.id, ok: [r.expect, ...(r.accept ?? [])], strict: r.strict, reveals: r.reveals, explicit: r.explicit }));
const r12 = (await Bun.file(new URL("./results-combined.json", import.meta.url).pathname).json())
  .map((r: any) => ({ id: r.id, ok: r.accept, strict: r.strict, reveals: r.reveals2, explicit: r.explicit }));
const frozen = (r: any) => r.strict >= 0.65 && r.explicit === "explicit" && r.reveals >= 0.5 ? "auto" : (r.strict >= 0.5 && r.reveals >= 0.5) || r.reveals >= 0.6 ? "pending" : "drop";
const variant = (r: any) => { const b = frozen(r); return b === "drop" && r.strict >= 0.5 && r.explicit === "explicit" ? "pending" : b; };
for (const [name, set] of [["round 3 (held-out)", r3], ["rounds 1+2", r12]] as const)
  for (const [rn, f] of [["frozen", frozen], ["variant", variant]] as const) {
    const miss = set.filter((r: any) => !r.ok.includes(f(r)));
    console.log(`${name} ${rn}: ${set.length - miss.length}/${set.length}  ${miss.map((r: any) => `${r.id}->${f(r)}`).join(" ")}`);
  }
