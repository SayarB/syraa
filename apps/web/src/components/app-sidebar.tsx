import {
  BrainIcon,
  ChevronsUpDownIcon,
  FileTextIcon,
  LogOutIcon,
  PaletteIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react";
import { MemoryPanel } from "@/components/memory-panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { THEME_PALETTES, type ThemePalette } from "@/lib/theme";
import type { ChatThread, ContextResource, MemoryItem } from "@/lib/types";
import { cn } from "@/lib/utils";

function statusClass(status: string): string {
  if (status === "ready") return "text-success";
  if (status === "failed") return "text-destructive";
  return "text-warning";
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

type Props = {
  subtitle: string;
  onNewChat: () => void;

  memory: {
    items: MemoryItem[];
    meta: string;
    pendingCount: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRefresh: () => void;
    onConfirm: (id: string) => void;
    onDismiss: (id: string) => void;
  };

  threads: ChatThread[];
  threadsLoading: boolean;
  activeThreadId: string | null;
  onOpenThread: (threadId: string) => void;

  resources: ContextResource[];
  onRefreshResources: () => void;
  onOpenResource: (resourceId: string) => void;

  displayName: string;
  palette: ThemePalette;
  onPaletteChange: (palette: ThemePalette) => void;
  onSignOut: () => void;
};

export function AppSidebar(props: Props) {
  const { memory } = props;
  const initial = props.displayName.slice(0, 1).toUpperCase() || "S";

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

        <SidebarMenu>
          <SidebarMenuItem>
            <Popover open={memory.open} onOpenChange={memory.onOpenChange}>
              <PopoverTrigger asChild>
                <SidebarMenuButton isActive={memory.open}>
                  <BrainIcon />
                  <span>Memory</span>
                </SidebarMenuButton>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" sideOffset={12} className="w-96 p-0">
                <MemoryPanel
                  items={memory.items}
                  meta={memory.meta}
                  onRefresh={memory.onRefresh}
                  onConfirm={memory.onConfirm}
                  onDismiss={memory.onDismiss}
                />
              </PopoverContent>
            </Popover>
            {memory.pendingCount > 0 ? (
              <SidebarMenuBadge className="rounded-full bg-primary-soft text-primary-soft-foreground">
                {memory.pendingCount}
              </SidebarMenuBadge>
            ) : null}
          </SidebarMenuItem>
        </SidebarMenu>
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
                No chats yet — send a message to start
              </p>
            ) : null}
            <SidebarMenu>
              {props.threads.map((thread) => (
                <SidebarMenuItem key={thread.id}>
                  <SidebarMenuButton
                    isActive={thread.id === props.activeThreadId}
                    onClick={() => props.onOpenThread(thread.id)}
                    title={thread.title}
                    className="data-[active=true]:shadow-soft"
                  >
                    <span>{thread.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Materials</SidebarGroupLabel>
          <SidebarGroupAction title="Refresh materials" onClick={props.onRefreshResources}>
            <RefreshCwIcon />
            <span className="sr-only">Refresh materials</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            {props.resources.length === 0 ? (
              <p className="px-2 py-1.5 text-muted-foreground text-xs">
                Upload PDFs from the composer
              </p>
            ) : null}
            <SidebarMenu>
              {props.resources.map((resource) => (
                <SidebarMenuItem key={resource.id}>
                  <SidebarMenuButton
                    onClick={() => props.onOpenResource(resource.id)}
                    title={`${resource.name} · ${statusLabel(resource.status)}`}
                  >
                    <FileTextIcon />
                    <span className="min-w-0 truncate">{resource.name}</span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "ml-auto size-2 shrink-0 rounded-full bg-current",
                        statusClass(resource.status),
                      )}
                    />
                    <span className="sr-only">{statusLabel(resource.status)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
                    <span className="truncate text-muted-foreground text-xs">
                      {memory.items.length} memories · {memory.pendingCount} pending
                    </span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <PaletteIcon className="size-4" />
                  Palette
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={props.palette}
                  onValueChange={(value) => props.onPaletteChange(value as ThemePalette)}
                >
                  {THEME_PALETTES.map((palette) => (
                    <DropdownMenuRadioItem key={palette.id} value={palette.id}>
                      <span
                        aria-hidden="true"
                        className="size-3 rounded-full ring-1 ring-border"
                        style={{ backgroundColor: palette.swatch }}
                      />
                      {palette.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
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
