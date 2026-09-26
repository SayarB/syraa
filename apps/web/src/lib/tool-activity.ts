import { getToolName, isToolUIPart, type UIMessage } from "ai";

export type ToolActivity = {
  toolName: string;
  label: string;
  active: boolean;
  summary: string;
  detail: string;
};

const TOOL_LABELS: Record<string, string> = {
  list_materials: "Listed materials",
  read_materials_section: "Read document section",
  get_my_memory: "Checked memory",
  web_search: "Searched the web",
  web_fetch: "Read page",
};

function toolTitle(name: string, active: boolean): string {
  const base = TOOL_LABELS[name] ?? name.replaceAll("_", " ");
  if (active) return `${base}…`;
  return base;
}

function formatInput(input: unknown): string {
  if (input == null) return "(none)";
  if (typeof input === "object" && Object.keys(input as object).length === 0) return "(none)";
  return JSON.stringify(input, null, 2);
}

function formatListMaterialsOutput(output: unknown): { summary: string; detail: string } {
  const data = output as {
    materials?: Array<{
      documentName?: string;
      status?: string;
      sectionTitles?: string[];
    }>;
  };

  const materials = data.materials ?? [];
  if (materials.length === 0) {
    return {
      summary: "No ingested documents returned.",
      detail: "Output\n  materials: []",
    };
  }

  const lines = materials.map((material) => {
    const sections = material.sectionTitles ?? [];
    const sectionBlock =
      sections.length === 0
        ? "    (no top-level sections)"
        : sections.map((title) => `    - ${title}`).join("\n");
    return `  • ${material.documentName ?? "unknown"} [${material.status ?? "?"}]\n${sectionBlock}`;
  });

  return {
    summary: `${materials.length} document(s): ${materials.map((m) => m.documentName).join(", ")}`,
    detail: ["Output", ...lines].join("\n"),
  };
}

function formatReadSectionOutput(output: unknown): { summary: string; detail: string } {
  const data = output as {
    error?: string;
    document?: string;
    section?: string;
    text?: string;
    truncated?: boolean;
    chunkCount?: number;
    availableDocuments?: string[];
    topSections?: string[];
  };

  if (data.error) {
    const extras: string[] = [];
    if (data.availableDocuments?.length) {
      extras.push(`available: ${data.availableDocuments.join(", ")}`);
    }
    if (data.topSections?.length) {
      extras.push(`sections: ${data.topSections.join(", ")}`);
    }
    return {
      summary: `Error: ${data.error}`,
      detail: ["Output", `  error: ${data.error}`, ...extras.map((line) => `  ${line}`)].join("\n"),
    };
  }

  const text = data.text ?? "";
  const charCount = text.length;
  const preview = text.length > 280 ? `${text.slice(0, 280).trim()}…` : text.trim();
  const truncatedNote = data.truncated ? " (truncated for model context)" : "";

  const summaryParts = [
    data.document ?? "document",
    data.section ? `§ ${data.section}` : null,
    `${charCount.toLocaleString()} chars${truncatedNote}`,
  ].filter(Boolean);

  const detailLines = [
    "Output",
    `  document: ${data.document ?? "?"}`,
    `  section: ${data.section ?? "(entire document)"}`,
    `  chars: ${charCount}${truncatedNote}`,
  ];
  if (data.chunkCount != null) detailLines.push(`  chunks: ${data.chunkCount}`);
  if (preview) {
    detailLines.push("", "  preview:", `  ${preview.replace(/\n/g, "\n  ")}`);
  }

  return {
    summary: summaryParts.join(" · "),
    detail: detailLines.join("\n"),
  };
}

type WebSearchOutput = {
  query?: string;
  results?: Array<{ title?: string; url?: string; snippet?: string }>;
  error?: string;
};

function formatWebSearchOutput(output: unknown): { summary: string; detail: string } {
  const data = output as WebSearchOutput;
  if (data.error) return { summary: data.error, detail: `Output\n  error: ${data.error}` };

  const results = data.results ?? [];
  const query = data.query ? ` for “${data.query}”` : "";
  const lines = results.map(
    (result, index) => `  ${index + 1}. ${result.title ?? "Untitled"}\n     ${result.url ?? ""}`,
  );
  return {
    summary: `${results.length} result${results.length === 1 ? "" : "s"}${query}`,
    detail: ["Output", ...(lines.length > 0 ? lines : ["  (no results)"])].join("\n"),
  };
}

type WebFetchOutput = {
  url?: string;
  content?: string;
  truncated?: boolean;
  error?: string;
};

function hostnameOf(url: string | undefined): string {
  if (!url) return "page";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatWebFetchOutput(output: unknown): { summary: string; detail: string } {
  const data = output as WebFetchOutput;
  const host = hostnameOf(data.url);
  if (data.error)
    return { summary: `${host} · ${data.error}`, detail: `Output\n  error: ${data.error}` };

  const chars = data.content?.length ?? 0;
  const truncated = data.truncated ? " (truncated)" : "";
  return {
    summary: `${host} · ${chars.toLocaleString()} characters${truncated}`,
    detail: `Output\n  ${data.url ?? ""}\n  ${chars.toLocaleString()} characters${truncated}`,
  };
}

export type WebSource = { title: string; url: string };

/** Links a finished web tool call contributed, for the Sources list under the reply. */
export function webSourcesFromPart(part: UIMessage["parts"][number]): WebSource[] {
  if (!isToolUIPart(part) || part.state !== "output-available") return [];
  const toolName = getToolName(part);

  if (toolName === "web_fetch") {
    const page = part.output as WebFetchOutput | undefined;
    if (!page?.url || page.error) return [];
    return [{ title: hostnameOf(page.url), url: page.url }];
  }
  if (toolName !== "web_search") return [];

  const results = (part.output as WebSearchOutput | undefined)?.results ?? [];
  return results.flatMap((result) =>
    result.url ? [{ title: result.title || result.url, url: result.url }] : [],
  );
}

function formatGenericOutput(output: unknown): { summary: string; detail: string } {
  const json = JSON.stringify(output, null, 2);
  const oneLine = json.replace(/\s+/g, " ").slice(0, 120);
  return {
    summary: oneLine.length < json.length ? `${oneLine}…` : oneLine,
    detail: `Output\n${json
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n")}`,
  };
}

export function formatToolActivity(
  part: UIMessage["parts"][number],
  active: boolean,
): ToolActivity | null {
  if (!isToolUIPart(part)) return null;

  const toolName = getToolName(part);
  const label = toolTitle(toolName, active);

  const hasInput =
    part.state === "input-available" ||
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "approval-requested" ||
    part.state === "approval-responded";

  const input = hasInput && "input" in part ? part.input : undefined;
  const inputBlock = `Input\n${formatInput(input)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")}`;

  if (part.state === "output-error") {
    const errorText = "errorText" in part ? part.errorText : "Tool failed";
    return {
      toolName,
      label,
      active,
      summary: errorText ?? "Tool failed",
      detail: [inputBlock, "", "Output", `  error: ${errorText ?? "unknown"}`].join("\n"),
    };
  }

  if (part.state !== "output-available") {
    return {
      toolName,
      label,
      active,
      summary: active ? "Running…" : "Waiting for tool result…",
      detail: inputBlock,
    };
  }

  const output = part.output;
  let formatted: { summary: string; detail: string };
  if (toolName === "list_materials") {
    formatted = formatListMaterialsOutput(output);
  } else if (toolName === "read_materials_section") {
    formatted = formatReadSectionOutput(output);
  } else if (toolName === "web_search") {
    formatted = formatWebSearchOutput(output);
  } else if (toolName === "web_fetch") {
    formatted = formatWebFetchOutput(output);
  } else {
    formatted = formatGenericOutput(output);
  }

  return {
    toolName,
    label,
    active,
    summary: formatted.summary,
    detail: [inputBlock, "", formatted.detail].join("\n"),
  };
}
