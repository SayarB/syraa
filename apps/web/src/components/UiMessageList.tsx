import { isTextUIPart, isToolUIPart, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatMemoryDraftNotice } from "../lib/memory-notice";
import { pickThinkingPhrase } from "../lib/thinking-status";
import { formatToolActivity } from "../lib/tool-activity";
import { extractTurnMessage } from "../lib/turn-message";
import { renderMarkdown } from "../lib/markdown";
import type { MemoryItem } from "../lib/types";

type ChatBlock =
  | { kind: "user"; id: string; text: string }
  | { kind: "tool"; id: string; label: string; summary: string; detail: string; active: boolean }
  | { kind: "assistant"; id: string; html: string; showCaret: boolean }
  | { kind: "memory"; id: string; text: string; variant: "draft" | "saved" };

function lastTextPartIndex(parts: UIMessage["parts"]): number {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (isTextUIPart(parts[index])) return index;
  }
  return -1;
}

function assistantHasVisibleText(message: UIMessage): boolean {
  return message.parts
    .filter(isTextUIPart)
    .some((part) => extractTurnMessage(part.text).trim().length > 0);
}

export function shouldShowThinking(messages: UIMessage[], streaming: boolean): boolean {
  if (!streaming) return false;

  const last = messages.at(-1);
  if (!last || last.role === "user") return true;
  if (last.role !== "assistant") return false;

  return !assistantHasVisibleText(last);
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
        const activity = formatToolActivity(part, !done && streaming && isLastMessage);
        if (activity) {
          blocks.push({
            kind: "tool",
            id: `${message.id}-tool-${index}`,
            label: activity.label,
            summary: activity.summary,
            detail: activity.detail,
            active: activity.active,
          });
        }
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

function ThinkingIndicator({ phrase }: { phrase: string }) {
  return (
    <div className="chat-thinking" aria-live="polite" aria-busy="true">
      <span className="chat-thinking-dot" aria-hidden="true" />
      <span className="chat-thinking-text">{phrase}</span>
    </div>
  );
}

export function UiMessageList({
  messages,
  streaming = false,
  memoryNoticeLines = [],
  onOpenMemory,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const [thinkingTick, setThinkingTick] = useState(0);
  const showThinking = shouldShowThinking(messages, streaming);
  const blocks = useMemo(
    () => flattenMessages(messages, streaming, memoryNoticeLines),
    [messages, streaming, memoryNoticeLines],
  );

  useEffect(() => {
    if (!showThinking) return;
    const id = window.setInterval(() => setThinkingTick((tick) => tick + 1), 2400);
    return () => window.clearInterval(id);
  }, [showThinking]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [blocks, showThinking, thinkingTick]);

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
            <details
              key={block.id}
              className={`chat-tool-accordion${block.active ? " active" : ""}`}
            >
              <summary className="chat-tool-summary-row" aria-label="Agent tool activity">
                <span className="chat-tool-chevron" aria-hidden="true">
                  ›
                </span>
                <span className="chat-tool-label">{block.label}</span>
                <span className="chat-tool-summary">{block.summary}</span>
              </summary>
              {block.detail ? <pre className="chat-tool-detail">{block.detail}</pre> : null}
            </details>
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
      {showThinking ? <ThinkingIndicator phrase={pickThinkingPhrase(thinkingTick)} /> : null}
      <div ref={endRef} />
    </>
  );
}
