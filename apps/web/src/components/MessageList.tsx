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
    <div className="messages" aria-live="polite">
      {messages.map((message) =>
        message.role === "assistant" ? (
          <div
            key={message.id}
            className="message assistant markdown-body"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized markdown
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        ) : (
          <div key={message.id} className={`message ${message.role}`}>
            {message.content}
          </div>
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}
