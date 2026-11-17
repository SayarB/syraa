import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MemoryItem } from "@/lib/types";

type Props = {
  items: MemoryItem[];
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

/** Saved and pending memories, with confirm / dismiss. Scrolling is left to the page around it. */
export function MemoryPanel({ items, onConfirm, onDismiss }: Props) {
  if (items.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-muted-foreground text-sm">
        Nothing saved yet. Chat naturally — durable facts show up here as they land.
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <MemoryRow key={item.id} item={item} onConfirm={onConfirm} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
