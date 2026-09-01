import { getToolName, isTextUIPart, isToolUIPart, type UIMessage } from "ai";
import { useEffect, useMemo, useRef } from "react";
import { formatMemoryDraftNotice } from "../lib/memory-notice";
import { extractTurnMessage } from "../lib/turn-message";
import { renderMarkdown } from "../lib/markdown";
import type { MemoryItem } from "../lib/types";

type ChatBlock =
  | { kind: "user"; id: string; text: string }
  | { kind: "tool"; id: string; label: string; active: boolean }
  | { kind: "assistant"; id: string; html: string; showCaret: boolean }
  | { kind: "memory"; id: string; text: string; variant: "draft" | "saved" };

function toolLabel(part: Extract<UIMessage["parts"][number], { type: string }>): string {
  if (!isToolUIPart(part)) return "Working…";
  const name = getToolName(part);
  const labels: Record<string, string> = {
    list_materials: "Listed materials",
    read_materials_section: "Read document section",
  };
  const label = labels[name] ?? name.replaceAll("_", " ");
  const done = part.state === "output-available" || part.state === "output-error";
  if (done) return label;
  if (part.state === "input-streaming" || part.state === "input-available") {
    return `${label.replace(/^(\w)/, (c) => c.toUpperCase())}…`;
  }
  return `${label}…`;
}

function lastTextPartIndex(parts: UIMessage["parts"]): number {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (isTextUIPart(parts[index])) return index;
  }
  return -1;
}

function flattenMessages(
  messages: UIMessage[],
  streaming: boolean,
  memoryNoticeLines: MemoryNoticeLine[],
): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  const lastMessage = messages.at(-1);
  const lastMessageId = lastMessage?.id;

  for (const message of messages) {
    if (message.role === "user") {
      const text = message.parts
        .filter(isTextUIPart)
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (text) blocks.push({ kind: "user", id: message.id, text });
      continue;
    }

    if (message.role !== "assistant") continue;

    const isLastMessage = message.id === lastMessageId;
    const textIndex = lastTextPartIndex(message.parts);

    message.parts.forEach((part, index) => {
      if (part.type === "step-start") return;

      if (isToolUIPart(part)) {
        const done = part.state === "output-available" || part.state === "output-error";
        blocks.push({
          kind: "tool",
          id: `${message.id}-tool-${index}`,
          label: toolLabel(part),
          active: !done && streaming && isLastMessage,
        });
        return;
      }

      if (part.type === "data-syraa-turn") {
        const data = part.data as { memoryItems?: MemoryItem[] };
        const text = formatMemoryDraftNotice(data.memoryItems ?? []);
        if (text) {
          blocks.push({
            kind: "memory",
            id: `${message.id}-memory-${index}`,
            text,
            variant: "draft",
          });
        }
        return;
      }

      if (!isTextUIPart(part)) return;

      const text = extractTurnMessage(part.text);
      const isStreamingText =
        streaming && isLastMessage && index === textIndex && part.state === "streaming";
      if (!text && !isStreamingText) return;

      blocks.push({
        kind: "assistant",
        id: `${message.id}-text-${index}`,
        html: text ? renderMarkdown(text) : "",
        showCaret: isStreamingText,
      });
    });
  }

  for (const notice of memoryNoticeLines) {
    blocks.push({
      kind: "memory",
      id: notice.id,
      text: notice.text,
      variant: notice.variant,
    });
  }

  return blocks;
}

type MemoryNoticeLine = {
  id: string;
  text: string;
  variant: "draft" | "saved";
};

type Props = {
  messages: UIMessage[];
  streaming?: boolean;
  memoryNoticeLines?: MemoryNoticeLine[];
  onOpenMemory?: () => void;
};

export function UiMessageList({
  messages,
  streaming = false,
  memoryNoticeLines = [],
  onOpenMemory,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const blocks = useMemo(
    () => flattenMessages(messages, streaming, memoryNoticeLines),
    [messages, streaming, memoryNoticeLines],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [blocks]);

  return (
    <>
      {blocks.map((block) => {
        if (block.kind === "user") {
          return (
            <div key={block.id} className="chat-user">
              <div className="chat-user-label">You</div>
              <div className="chat-user-text">{block.text}</div>
            </div>
          );
        }

        if (block.kind === "tool") {
          return (
            <div
              key={block.id}
              className={`chat-tool${block.active ? " active" : ""}`}
              aria-label="Agent tool activity"
            >
              {block.label}
            </div>
          );
        }

        if (block.kind === "memory") {
          return (
            <button
              key={block.id}
              type="button"
              className={`chat-memory${block.variant === "saved" ? " is-saved" : ""}`}
              onClick={onOpenMemory}
            >
              {block.text}
            </button>
          );
        }

        return (
          <div
            key={block.id}
            className={`chat-assistant markdown-body${block.showCaret ? " streaming-caret" : ""}`}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized markdown
            dangerouslySetInnerHTML={{ __html: block.html }}
          />
        );
      })}
      <div ref={endRef} />
    </>
  );
}
