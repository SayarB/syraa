import {
  ChevronRightIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { ThreadMenuItem } from "@/components/thread-menu-item";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { ChatThread } from "@/lib/types";

type Props = {
  subtitle: string;
  onNewChat: () => void;

  threads: ChatThread[];
  archivedThreads: ChatThread[];
  threadsLoading: boolean;
  activeThreadId: string | null;
  onOpenThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onArchiveThread: (threadId: string, archived: boolean) => void;
  onDeleteThread: (thread: ChatThread) => void;

  displayName: string;
  /** Memories waiting to be confirmed (reviewed under Settings → Context). */
  pendingMemories: number;
  onOpenSettings: () => void;
  onSignOut: () => void;
};

export function AppSidebar(props: Props) {
  const initial = props.displayName.slice(0, 1).toUpperCase() || "S";

  const threadActions = (thread: ChatThread) => ({
    active: thread.id === props.activeThreadId,
    onOpen: () => props.onOpenThread(thread.id),
    onRename: (title: string) => props.onRenameThread(thread.id, title),
    onArchiveChange: (archived: boolean) => props.onArchiveThread(thread.id, archived),
    onDelete: () => props.onDeleteThread(thread),
  });

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="gap-3">
        <div className="flex items-center gap-2.5 px-1.5 pt-1">
          <span className="grid size-8 place-items-center rounded-lg bg-primary font-semibold text-primary-foreground text-sm">
            S
          </span>
          <div className="min-w-0 leading-tight">
            <p className="font-semibold text-sm">Syraa</p>
            <p className="truncate text-muted-foreground text-xs">{props.subtitle}</p>
          </div>
        </div>

        <Button className="h-9 w-full rounded-xl" onClick={props.onNewChat}>
          <PlusIcon />
          New chat
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            {props.threadsLoading && props.threads.length === 0 ? (
              <p className="px-2 py-1.5 text-muted-foreground text-xs">Loading…</p>
            ) : null}
            {!props.threadsLoading && props.threads.length === 0 ? (
              <p className="px-2 py-1.5 text-muted-foreground text-xs">
                {props.archivedThreads.length > 0
                  ? "No active chats — send a message to start"
                  : "No chats yet — send a message to start"}
              </p>
            ) : null}
            <SidebarMenu>
              {props.threads.map((thread) => (
                <ThreadMenuItem key={thread.id} thread={thread} {...threadActions(thread)} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {props.archivedThreads.length > 0 ? (
          <Collapsible className="group/archived">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="w-full gap-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                  <ChevronRightIcon className="transition-transform group-data-[state=open]/archived:rotate-90" />
                  Archived
                  <span className="ml-auto tabular-nums">{props.archivedThreads.length}</span>
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {props.archivedThreads.map((thread) => (
                      <ThreadMenuItem key={thread.id} thread={thread} {...threadActions(thread)} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary-soft text-primary-soft-foreground">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate font-medium text-sm">{props.displayName}</span>
                    {props.pendingMemories > 0 ? (
                      <span className="truncate text-muted-foreground text-xs">
                        {props.pendingMemories}{" "}
                        {props.pendingMemories === 1 ? "memory" : "memories"} to review
                      </span>
                    ) : null}
                  </div>
                  <ChevronsUpDownIcon className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuItem onSelect={props.onOpenSettings}>
                  <SettingsIcon />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={props.onSignOut}>
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
