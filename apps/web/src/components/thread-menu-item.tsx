import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarInput,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { ChatThread } from "@/lib/types";

type Props = {
  thread: ChatThread;
  active: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
  onArchiveChange: (archived: boolean) => void;
  onDelete: () => void;
};

/** One chat in the sidebar: opens on click; the hover menu renames, archives or deletes it. */
export function ThreadMenuItem({
  thread,
  active,
  onOpen,
  onRename,
  onArchiveChange,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thread.title);
  // Set when "Rename" is picked, so the menu does not pull focus back to its trigger on close.
  const startingRename = useRef(false);

  function startRename() {
    startingRename.current = true;
    setDraft(thread.title);
    setEditing(true);
  }

  function finishRename(save: boolean) {
    setEditing(false);
    const title = draft.trim();
    if (save && title && title !== thread.title) onRename(title);
  }

  if (editing) {
    return (
      <SidebarMenuItem>
        <SidebarInput
          autoFocus
          aria-label="Chat name"
          value={draft}
          maxLength={120}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => finishRename(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") finishRename(true);
            if (event.key === "Escape") finishRename(false);
          }}
        />
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        onClick={onOpen}
        title={thread.title}
        className="data-[active=true]:shadow-soft"
      >
        <span>{thread.title}</span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover aria-label={`Actions for ${thread.title}`}>
            <MoreHorizontalIcon />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          className="w-44"
          onCloseAutoFocus={(event) => {
            if (startingRename.current) {
              event.preventDefault();
              startingRename.current = false;
            }
          }}
        >
          <DropdownMenuItem onSelect={startRename}>
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          {thread.archived ? (
            <DropdownMenuItem onSelect={() => onArchiveChange(false)}>
              <ArchiveRestoreIcon />
              Unarchive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => onArchiveChange(true)}>
              <ArchiveIcon />
              Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
