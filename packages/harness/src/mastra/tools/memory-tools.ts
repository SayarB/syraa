import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getChatRunContext } from "../../chat-run-context.js";
import { getMemory, listMemoryForUser } from "../../memory.js";
import { rememberToolResult } from "../../tool-call-dedupe.js";

/**
 * What Syraa knows about the user, read from product memory at call time. The answer to
 * "what do you know about me" must come from here — never from earlier replies in the thread,
 * which can be stale (items since removed) or made up.
 */
export const getMyMemoryTool = createTool({
  id: "get_my_memory",
  description:
    "Returns everything saved about the user right now: active preferences, rules, methods, and decisions, plus items still waiting for the user's confirmation. Call this whenever the user asks what you know or remember about them, and answer only from its result.",
  inputSchema: z.object({}),
  mcp: {
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  execute: async (input) => {
    const { userId } = getChatRunContext();
    const { service } = await getMemory();
    const { items } = await listMemoryForUser(service, userId);

    const toEntry = (item: (typeof items)[number]) => ({ type: item.type, text: item.text });
    const result = {
      active: items.filter((item) => item.status === "active").map(toEntry),
      pendingConfirmation: items.filter((item) => item.status === "pending").map(toEntry),
      note: "This is the complete record. Anything not listed here is not remembered, even if an earlier reply in this thread said otherwise.",
    };
    rememberToolResult("get_my_memory", input, result);
    return result;
  },
});
