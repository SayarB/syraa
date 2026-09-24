const { results } = await Bun.file(new URL("./results.json", import.meta.url).pathname).json();
const band = (r:any, A:number, P:number) => r.p>=A && r.explicitness.choice==="explicit" ? "auto" : r.p>=P ? "pending" : "drop";
for (const [A,P] of [[0.85,0.5],[0.75,0.5],[0.65,0.5],[0.65,0.3],[0.65,0.6]]) {
  const miss = results.filter((r:any)=>!r.accept.includes(band(r,A,P))).map((r:any)=>`${r.id}->${band(r,A,P)}`);
  console.log(`AUTO=${A} PENDING=${P}: ${results.length-miss.length}/${results.length}  ${miss.join(" ")}`);
}
const pos = results.filter((r:any)=>r.kind && r.kind!=="none");
const kindOk = pos.filter((r:any)=>r.kindAns.choice===r.kind);
console.log(`kind agreement on durable cases: ${kindOk.length}/${pos.length}`);
const sc = results.filter((r:any)=>typeof r.selfContained==="boolean");
for (const t of [0.5,0.7,0.85]) console.log(`self_contained @${t}: ${sc.filter((r:any)=>(r.selfP>=t)===r.selfContained).length}/${sc.length}`, sc.filter((r:any)=>(r.selfP>=t)!==r.selfContained).map((r:any)=>r.id).join(" "));
console.log("max |p-p2|:", Math.max(...results.map((r:any)=>Math.abs(r.p-r.p2))).toFixed(3));
const neg = results.filter((r:any)=>r.accept.includes("drop") && !r.accept.includes("auto"));
console.log("regex would auto-activate on non-durable:", neg.filter((r:any)=>r.regex==="auto").map((r:any)=>r.id).join(" "));
console.log("regex defers to LLM on durable:", results.filter((r:any)=>!r.accept.includes("drop") && r.regex==="llm-decides").map((r:any)=>r.id).join(" "));
