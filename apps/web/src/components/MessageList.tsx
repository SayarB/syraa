import { useEffect, useRef } from "react";
import { renderMarkdown } from "../lib/markdown";
import type { DisplayMessage } from "../lib/types";

type Props = {
  messages: DisplayMessage[];
};

export function MessageList({ messages }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the message list changes
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <>
      {messages.map((message) => {
        if (message.role === "activity") {
          return (
            <div key={message.id} className="chat-tool" aria-label="Agent activity">
              {message.content}
            </div>
          );
        }

        if (message.role === "assistant") {
          return (
            <div
              key={message.id}
              className={`chat-assistant markdown-body${message.streaming ? " streaming-caret" : ""}`}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized markdown
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            />
          );
        }

        return (
          <div key={message.id} className="chat-system">
            {message.content}
          </div>
        );
      })}
      <div ref={endRef} />
    </>
  );
}
