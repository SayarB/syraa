# @syraa/history

Keeps a long chat cheap and still recoverable. Pure functions only: **no Mastra imports**
(see `.cursor/rules/mastra-first.mdc`). The harness wires it in as a processor, a background job
and a tool.

## Compaction

History is split into whole **turns** (a user message and the replies to it). The newest turns are
sent exactly as written; older turns become summaries that get shorter with age:

```
oldest ─► epoch note ─► short ─► detail ─► verbatim ◄─ newest
```

| Setting | Default | Meaning |
|---|---|---|
| `recentTurns` (`n`) | 3 | turns always sent as written |
| `chunkTurns` (`k`) | 4 | turns per chunk; tiers rebuild only every `k` turns |
| `growth` (`g`) | 2 | each older tier spans `g×` more turns |
| budgets | 1500 / 1000 / 500 / 8000 | tokens for all detail / short summaries, the epoch note, and unsummarised recent turns |

- **`k` is what keeps the prompt cache warm.** The summarised prefix only changes when a whole chunk
  ages out, so between rebuilds it is byte-identical.
- **Every chunk is summarised once, from its raw messages**, into a detail and a short form. Only
  the single epoch note (everything older) is rewritten from earlier summaries.
- **Budgets, not message counts**, set summary lengths: a tier's budget is split across its chunks.
- If summaries are behind or failing, `fallbackActions` shortens, then drops, the oldest unsummarised
  turns by token budget, so prompts stay bounded without a model call.

State (`CompactionState`) is stored by the harness in `thread_history_summaries`, one row per thread,
written with an optimistic revision check.

## Recall

`searchMessages` and `getMessageWindow` back the agent's `thread_history` tool: find messages in the
current thread by words or date, or fetch one with its neighbours. Summaries cite message positions
("messages 9–16") that match the positions the tool reports.
