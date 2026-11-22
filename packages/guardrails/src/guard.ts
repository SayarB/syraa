import {
  askJev,
  isJevConfigured,
  type JevAnswers,
  type JevTrace,
  type QuestionSet,
} from "./jev.js";

export type VerdictState = "clean" | "flagged" | "unchecked";

export type GuardVerdict = {
  state: VerdictState;
  /** Category ids from `decide`; empty unless flagged. */
  categories: string[];
  answers: Record<string, number | string> | null;
  model: string | null;
  error: string | null;
};

/** The Jev state for a user chat message. Shared by the processor and the eval so they cannot drift. */
export function userMessageState(text: string): string {
  return `User message: ${text}`;
}

export type Guard = {
  readonly name: string;
  /** False without a Jev key: the guard is off and `run` resolves `null`. */
  readonly enabled: boolean;
  /** Never rejects. `null` = guard disabled, nothing to record. */
  run(state: string, trace?: JevTrace): Promise<GuardVerdict | null>;
};

export type GuardDefinition<Q extends QuestionSet> = {
  name: string;
  questions: Q;
  /** Pure: the flagged category ids, [] when clean. Unit-tested offline. */
  decide(answers: JevAnswers<Q>): string[];
  timeoutMs?: number;
};

/**
 * A guard bundles a name, a question set and a pure decision. A failed Jev call (HTTP error,
 * timeout, malformed answer) becomes an `unchecked` verdict, never a rejection.
 */
export function defineGuard<Q extends QuestionSet>(def: GuardDefinition<Q>): Guard {
  return {
    name: def.name,
    get enabled() {
      return isJevConfigured();
    },
    async run(state, trace) {
      if (!isJevConfigured()) return null;
      try {
        let usedModel: string | null = null;
        const tracedModel: JevTrace = {
          start: (call) => {
            const span = trace?.start(call);
            return {
              end: (result) => {
                usedModel = result.model;
                span?.end(result);
              },
              fail: (error) => span?.fail(error),
            };
          },
        };
        const answers = await askJev(state, def.questions, {
          trace: tracedModel,
          timeoutMs: def.timeoutMs,
        });
        const categories = def.decide(answers);
        return {
          state: categories.length > 0 ? "flagged" : "clean",
          categories,
          answers: answers as Record<string, number | string>,
          model: usedModel,
          error: null,
        };
      } catch (error) {
        return {
          state: "unchecked",
          categories: [],
          answers: null,
          model: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
