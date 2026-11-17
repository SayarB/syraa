import { FileTextIcon, RefreshCwIcon } from "lucide-react";
import { MemoryPanel } from "@/components/memory-panel";
import { SettingsSection } from "@/components/settings-section";
import { Button } from "@/components/ui/button";
import type { ContextResource, MemoryItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ContextSettingsProps = {
  memory: {
    items: MemoryItem[];
    /** Memory id and counts, e.g. "3f2a1b2c… · 4 item(s)". */
    meta: string;
    onRefresh: () => void;
    onConfirm: (id: string) => void;
    onDismiss: (id: string) => void;
  };
  materials: {
    resources: ContextResource[];
    onRefresh: () => void;
    onOpen: (resourceId: string) => void;
  };
};

function statusClass(status: string): string {
  if (status === "ready") return "text-success";
  if (status === "failed") return "text-destructive";
  return "text-warning";
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

function RefreshButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label} title={label}>
      <RefreshCwIcon />
    </Button>
  );
}

/** What the assistant knows about the user (memory) and the documents they gave it (materials). */
export function ContextSettings({ memory, materials }: ContextSettingsProps) {
  return (
    <div className="grid gap-6">
      <SettingsSection
        title="Memory"
        action={<RefreshButton label="Refresh memory" onClick={memory.onRefresh} />}
      >
        <p className="font-mono text-[0.68rem] text-muted-foreground">{memory.meta}</p>
        <MemoryPanel
          items={memory.items}
          onConfirm={memory.onConfirm}
          onDismiss={memory.onDismiss}
        />
      </SettingsSection>

      <SettingsSection
        title="Materials"
        action={<RefreshButton label="Refresh materials" onClick={materials.onRefresh} />}
      >
        {materials.resources.length === 0 ? (
          <p className="text-muted-foreground text-sm">Upload PDFs from the composer.</p>
        ) : (
          <ul className="grid gap-1">
            {materials.resources.map((resource) => (
              <li key={resource.id}>
                <button
                  type="button"
                  onClick={() => materials.onOpen(resource.id)}
                  title={`${resource.name} · ${statusLabel(resource.status)}`}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{resource.name}</span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 text-xs",
                      statusClass(resource.status),
                    )}
                  >
                    <span aria-hidden="true" className="size-2 rounded-full bg-current" />
                    {statusLabel(resource.status)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
