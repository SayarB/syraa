import { CheckIcon, MoonIcon, SlidersHorizontalIcon, SunIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserSettings } from "@/lib/settings";
import { THEME_PALETTES, type Theme, type ThemeMode, type ThemePalette } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Settings categories, in nav order. Add a category here and render it below. */
const CATEGORIES = [{ id: "general", label: "General", icon: SlidersHorizontalIcon }] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: Theme;
  onPaletteChange: (palette: ThemePalette) => void;
  onModeChange: (mode: ThemeMode) => void;
};

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</h3>
      <div className="grid gap-4 rounded-xl border p-4">{children}</div>
    </section>
  );
}

/** A label + description beside a control. Without `htmlFor`, the control names itself (e.g. a fieldset legend). */
function SettingRow(props: {
  label: string;
  description: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="grid gap-0.5">
        {props.htmlFor ? (
          <Label htmlFor={props.htmlFor}>{props.label}</Label>
        ) : (
          <p aria-hidden="true" className="font-medium text-sm leading-none">
            {props.label}
          </p>
        )}
        <p className="text-muted-foreground text-xs">{props.description}</p>
      </div>
      <div className="shrink-0">{props.children}</div>
    </div>
  );
}

const MODES = [
  { id: "light", label: "Light", icon: SunIcon },
  { id: "dark", label: "Dark", icon: MoonIcon },
] as const;

function GeneralSettings(props: Omit<Props, "open" | "onOpenChange">) {
  const { settings, options, loadError, saveError, load, update } = useUserSettings();

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-6">
      <SettingsSection title="Appearance">
        <SettingRow label="Mode" description="Light or dark interface.">
          <fieldset className="flex gap-1 rounded-lg bg-muted p-1">
            <legend className="sr-only">Mode</legend>
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                aria-pressed={props.theme.mode === mode.id}
                onClick={() => props.onModeChange(mode.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors",
                  props.theme.mode === mode.id
                    ? "bg-background text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <mode.icon className="size-3.5" />
                {mode.label}
              </button>
            ))}
          </fieldset>
        </SettingRow>

        <fieldset className="grid gap-2">
          <legend className="contents">
            <span className="block font-medium text-sm leading-none">Palette</span>
          </legend>
          <p className="text-muted-foreground text-xs">Accent colours across the app.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {THEME_PALETTES.map((palette) => {
              const selected = props.theme.palette === palette.id;
              return (
                <button
                  key={palette.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => props.onPaletteChange(palette.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                    selected && "border-primary bg-muted",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-3.5 shrink-0 rounded-full ring-1 ring-border"
                    style={{ backgroundColor: palette.swatch }}
                  />
                  <span className="min-w-0 flex-1 truncate">{palette.label}</span>
                  {selected ? <CheckIcon className="size-3.5 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      </SettingsSection>

      <SettingsSection title="Chat titles">
        <SettingRow
          label="Title model"
          description="Writes a short title for each new chat."
          htmlFor="settings-title-model"
        >
          <Select
            value={settings?.titleModel ?? ""}
            onValueChange={(titleModel) => void update({ titleModel })}
            disabled={!settings || !options}
          >
            <SelectTrigger id="settings-title-model" className="w-56">
              <SelectValue placeholder={loadError ? "Unavailable" : "Loading…"} />
            </SelectTrigger>
            <SelectContent>
              {options?.titleModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        {loadError ? (
          <p className="flex items-center gap-2 text-destructive text-xs">
            Could not load settings: {loadError}
            <Button variant="outline" size="xs" onClick={() => void load()}>
              Retry
            </Button>
          </p>
        ) : null}
        {saveError ? (
          <p className="text-destructive text-xs">Could not save settings: {saveError}</p>
        ) : null}
      </SettingsSection>
    </div>
  );
}

export function SettingsDialog({ open, onOpenChange, ...rest }: Props) {
  const [category, setCategory] = useState<CategoryId>("general");
  const active = CATEGORIES.find((entry) => entry.id === category) ?? CATEGORIES[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(85vh,600px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">Your account settings.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            aria-label="Settings categories"
            className="flex shrink-0 gap-1 border-b p-2 sm:w-44 sm:flex-col sm:border-r sm:border-b-0"
          >
            {CATEGORIES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-current={entry.id === category ? "page" : undefined}
                onClick={() => setCategory(entry.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  entry.id === category && "bg-muted font-medium",
                )}
              >
                <entry.icon className="size-4" />
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <h2 className="mb-4 font-semibold text-base">{active.label}</h2>
            {category === "general" ? <GeneralSettings {...rest} /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
