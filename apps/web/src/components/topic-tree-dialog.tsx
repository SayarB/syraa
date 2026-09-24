import { ChevronRightIcon, FileTextIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ResourceTopicTree, TopicTreeNode } from "@/lib/types";
import { cn } from "@/lib/utils";

function TopicNode({ node, depth = 0 }: { node: TopicTreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const isTopic = node.kind === "topic";
  const hasChildren = node.children.length > 0;
  const expanded = isTopic ? open && hasChildren : open;

  let Icon = FileTextIcon;
  if (isTopic) Icon = expanded ? FolderOpenIcon : FolderIcon;

  return (
    <div className={cn("grid gap-0.5", depth > 0 && "pl-4")}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
      >
        <ChevronRightIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
            isTopic && !hasChildren && "invisible",
          )}
        />
        <Icon
          className={cn("size-4 shrink-0", isTopic ? "text-primary" : "text-muted-foreground")}
        />
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
        <span className="font-mono text-[0.68rem] text-muted-foreground">
          {isTopic ? node.children.length : node.role}
        </span>
      </button>

      {isTopic && open
        ? node.children.map((child) => <TopicNode key={child.id} node={child} depth={depth + 1} />)
        : null}

      {!isTopic && open && node.text ? (
        <pre className="mb-1 ml-8 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-muted-foreground text-xs leading-relaxed">
          {node.text}
        </pre>
      ) : null}
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ResourceTopicTree | null;
  loading: boolean;
  error: string | null;
};

function describe(data: ResourceTopicTree | null, loading: boolean, error: string | null): string {
  if (loading) return "Loading…";
  if (error) return error;
  if (!data) return "—";
  return `${data.topicCount} topics · ${data.chunkCount} chunks · ${data.resource.status}`;
}

export function TopicTreeDialog({ open, onOpenChange, data, loading, error }: Props) {
  const ready = !loading && !error && data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data?.resource.name ?? "Topic tree"}</DialogTitle>
          <DialogDescription>{describe(data, loading, error)}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="-mx-2 min-h-0 flex-1 px-2">
          {ready && data.tree.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">
              No topics yet — ingest may still be running, or the PDF had no extractable outline.
            </p>
          ) : null}
          {ready ? data.tree.map((node) => <TopicNode key={node.id} node={node} />) : null}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
