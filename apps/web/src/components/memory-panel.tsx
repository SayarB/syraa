import { RefreshCwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { MemoryItem } from "@/lib/types";

type Props = {
  items: MemoryItem[];
  meta: string;
  onRefresh: () => void;
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function MemoryRow({
  item,
  onConfirm,
  onDismiss,
}: {
  item: MemoryItem;
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const pending = item.status === "pending";

  return (
    <article
      className={
        pending ? "grid gap-2 rounded-xl bg-primary-soft p-3" : "grid gap-2 rounded-xl bg-muted p-3"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant={pending ? "default" : "secondary"} className="rounded-full">
          {item.type}
          {pending ? " · pending" : ""}
        </Badge>
        {pending ? null : (
          <Button variant="ghost" size="xs" onClick={() => onDismiss(item.id)}>
            Dismiss
          </Button>
        )}
      </div>
      <p className="text-sm leading-relaxed">{item.text}</p>
      {item.why ? <p className="text-muted-foreground text-xs italic">{item.why}</p> : null}
      <time className="font-mono text-[0.68rem] text-muted-foreground">
        {formatTime(item.createdAt)} · {item.source}
      </time>
      {pending ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onConfirm(item.id)}>
            Remember
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDismiss(item.id)}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </article>
  );
}

/** Body of the Memory popover: saved and pending memories with confirm / dismiss. */
export function MemoryPanel({ items, meta, onRefresh, onConfirm, onDismiss }: Props) {
  return (
    <div className="flex max-h-[min(32rem,70vh)] flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-sm">Memory</h2>
          <p className="truncate font-mono text-[0.68rem] text-muted-foreground">{meta}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onRefresh} aria-label="Refresh memory">
          <RefreshCwIcon />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-2 p-3">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-muted-foreground text-sm">
              Nothing saved yet. Chat naturally — durable facts show up here as they land.
            </p>
          ) : (
            items.map((item) => (
              <MemoryRow key={item.id} item={item} onConfirm={onConfirm} onDismiss={onDismiss} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
