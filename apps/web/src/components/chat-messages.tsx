import { isTextUIPart, isToolUIPart, type UIMessage } from "ai";
import { BrainIcon, CheckIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { Tool, ToolContent, ToolHeader, type ToolPart } from "@/components/ai-elements/tool";
import { formatMemoryDraftNotice } from "@/lib/memory-notice";
import { pickThinkingPhrase } from "@/lib/thinking-status";
import { formatToolActivity, type WebSource, webSourcesFromPart } from "@/lib/tool-activity";
import { extractTurnMessage } from "@/lib/turn-message";
import type { DisplayMessage, MemoryItem } from "@/lib/types";

export type MemoryNoticeLine = {
  id: string;
  text: string;
  variant: "draft" | "saved";
};

type ChatBlock =
  | { kind: "user"; id: string; text: string }
  | { kind: "tool"; id: string; part: ToolPart; label: string; summary: string; detail: string }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | { kind: "sources"; id: string; sources: WebSource[] }
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

function shouldShowThinking(messages: UIMessage[], streaming: boolean): boolean {
  if (!streaming) return false;

  const last = messages.at(-1);
  if (!last || last.role === "user") return true;
  if (last.role !== "assistant") return false;

  return !assistantHasVisibleText(last);
}

function userText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

const CITED_LINK = /\]\((https?:\/\/[^)\s]+)\)/g;

/** Same page, ignoring case in the host, a trailing slash and a #fragment. */
function comparableUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return raw;
  }
}

/**
 * Sources shown under a reply: the ones the reply actually links to. Falls back to every web
 * result when the reply cites none (so the user can still see what was looked at).
 */
function citedSources(message: UIMessage, candidates: WebSource[]): WebSource[] {
  const text = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n");
  const cited = new Set([...text.matchAll(CITED_LINK)].map((match) => comparableUrl(match[1])));
  const used = candidates.filter((source) => cited.has(comparableUrl(source.url)));
  return used.length > 0 ? used : candidates;
}

function flattenMessages(
  messages: UIMessage[],
  streaming: boolean,
  memoryNoticeLines: MemoryNoticeLine[],
): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  const lastMessageId = messages.at(-1)?.id;

  for (const message of messages) {
    if (message.role === "user") {
      const text = userText(message);
      if (text) blocks.push({ kind: "user", id: message.id, text });
      continue;
    }

    if (message.role !== "assistant") continue;

    const isLastMessage = message.id === lastMessageId;
    const textIndex = lastTextPartIndex(message.parts);
    const sources = new Map<string, WebSource>();

    message.parts.forEach((part, index) => {
      if (part.type === "step-start") return;

      if (isToolUIPart(part)) {
        for (const source of webSourcesFromPart(part)) {
          if (!sources.has(source.url)) sources.set(source.url, source);
        }
        const done = part.state === "output-available" || part.state === "output-error";
        const activity = formatToolActivity(part, !done && streaming && isLastMessage);
        if (!activity) return;
        blocks.push({
          kind: "tool",
          id: `${message.id}-tool-${index}`,
          part,
          label: activity.label,
          summary: activity.summary,
          detail: activity.detail,
        });
        return;
      }

      if (part.type === "data-syraa-turn") {
        const data = part.data as { memoryItems?: MemoryItem[] };
        const text = formatMemoryDraftNotice(data.memoryItems ?? []);
        if (!text) return;
        blocks.push({
          kind: "memory",
          id: `${message.id}-memory-${index}`,
          text,
          variant: "draft",
        });
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
        text,
        streaming: isStreamingText,
      });
    });

    if (sources.size > 0) {
      blocks.push({
        kind: "sources",
        id: `${message.id}-sources`,
        sources: citedSources(message, [...sources.values()]),
      });
    }
  }

  for (const notice of memoryNoticeLines) {
    blocks.push({ kind: "memory", id: notice.id, text: notice.text, variant: notice.variant });
  }

  return blocks;
}

function ToolBlock({ block }: { block: Extract<ChatBlock, { kind: "tool" }> }) {
  const { part } = block;
  const header =
    part.type === "dynamic-tool" ? (
      <ToolHeader
        type={part.type}
        state={part.state}
        toolName={part.toolName}
        title={block.label}
      />
    ) : (
      <ToolHeader type={part.type} state={part.state} title={block.label} />
    );

  return (
    <Tool className="mb-0 rounded-xl border-0 bg-muted">
      {header}
      <ToolContent className="space-y-2 px-3 pt-0 pb-3">
        {block.summary ? <p className="text-muted-foreground text-sm">{block.summary}</p> : null}
        {block.detail ? (
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 font-mono text-muted-foreground text-xs">
            {block.detail}
          </pre>
        ) : null}
      </ToolContent>
    </Tool>
  );
}

function MemoryNotice({
  block,
  onOpenMemory,
}: {
  block: Extract<ChatBlock, { kind: "memory" }>;
  onOpenMemory?: () => void;
}) {
  const Icon = block.variant === "saved" ? CheckIcon : BrainIcon;
  return (
    <button
      type="button"
      onClick={onOpenMemory}
      className="flex w-full items-center gap-2 rounded-xl bg-primary-soft px-3.5 py-2 text-left font-medium text-primary-soft-foreground text-sm transition-colors hover:bg-primary-soft/80"
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{block.text}</span>
      <span className="shrink-0 text-xs opacity-80">View</span>
    </button>
  );
}

type Props = {
  messages: UIMessage[];
  streaming?: boolean;
  memoryNoticeLines?: MemoryNoticeLine[];
  systemMessages?: DisplayMessage[];
  onOpenMemory?: () => void;
};

/** The transcript: user bubbles, assistant markdown, tool activity and memory notices. */
export function ChatMessages({
  messages,
  streaming = false,
  memoryNoticeLines = [],
  systemMessages = [],
  onOpenMemory,
}: Props) {
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

  return (
    <>
      {blocks.map((block) => {
        if (block.kind === "user") {
          return (
            <Message key={block.id} from="user">
              <MessageContent className="group-[.is-user]:rounded-2xl group-[.is-user]:rounded-br-md group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground">
                <p className="whitespace-pre-wrap break-words text-[0.95rem]">{block.text}</p>
              </MessageContent>
            </Message>
          );
        }

        if (block.kind === "tool") return <ToolBlock key={block.id} block={block} />;

        if (block.kind === "sources") {
          return (
            <Sources key={block.id} className="mb-0">
              <SourcesTrigger count={block.sources.length} />
              <SourcesContent>
                {block.sources.map((source) => (
                  <Source
                    key={source.url}
                    href={source.url}
                    title={source.title}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                  />
                ))}
              </SourcesContent>
            </Sources>
          );
        }

        if (block.kind === "memory") {
          return <MemoryNotice key={block.id} block={block} onOpenMemory={onOpenMemory} />;
        }

        return (
          <Message key={block.id} from="assistant">
            <MessageContent className="text-[0.95rem] leading-relaxed">
              <MessageResponse isAnimating={block.streaming}>{block.text}</MessageResponse>
            </MessageContent>
          </Message>
        );
      })}

      {showThinking ? (
        <div aria-live="polite" aria-busy="true" className="text-sm">
          <Shimmer>{pickThinkingPhrase(thinkingTick)}</Shimmer>
        </div>
      ) : null}

      {systemMessages.map((message) => (
        <p key={message.id} className="self-center text-center text-muted-foreground text-xs">
          {message.content}
        </p>
      ))}
    </>
  );
}
