/**
 * toModelOutput must return a typed tool output, not a bare string: a string reaches the
 * OpenAI-compatible request as a tool message with no `content`, so the model sees an empty result
 * and writes an imagined one (raw JSON in the reply, made-up "results").
 */
export function textForModel(value: string): { type: "text"; value: string } {
  return { type: "text", value };
}
