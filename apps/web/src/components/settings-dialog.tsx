import { BrainIcon, CheckIcon, MoonIcon, SlidersHorizontalIcon, SunIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { ContextSettings, type ContextSettingsProps } from "@/components/context-settings";
import { formatModelPrice, ModelPicker } from "@/components/model-picker";
import { SettingsSection } from "@/components/settings-section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type ModelOption, useModelOptions, type useUserSettings } from "@/lib/settings";
import { THEME_PALETTES, type Theme, type ThemeMode, type ThemePalette } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Settings categories, in nav order. Add a category here and render it below. */
const CATEGORIES = [
  { id: "general", label: "General", icon: SlidersHorizontalIcon },
  { id: "context", label: "Context", icon: BrainIcon },
] as const;

export type SettingsCategory = (typeof CATEGORIES)[number]["id"];

type Props = ContextSettingsProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The open category. Controlled, so the app can open Settings straight to one (e.g. memory notices). */
  category: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
  /** Memories waiting to be confirmed: shown on the Context category. */
  pendingMemories: number;
  /** The account settings, owned by the app so other views (the model name in the sidebar) follow them. */
  userSettings: ReturnType<typeof useUserSettings>;
  theme: Theme;
  onPaletteChange: (palette: ThemePalette) => void;
  onModeChange: (mode: ThemeMode) => void;
};

type GeneralProps = Pick<Props, "userSettings" | "theme" | "onPaletteChange" | "onModeChange">;

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

/**
 * A model setting. Picking a premium model asks first: calls use the app's own AI key, so a costly
 * model adds up for everyone.
 */
function ModelSetting(props: {
  id: string;
  label: string;
  description: string;
  value: string | undefined;
  models: ModelOption[] | null;
  modelsError: string | null;
  /** What the default ("chat") value is called in this setting. */
  defaultLabel: string;
  /** Offer only some models. */
  filter?: (model: ModelOption) => boolean;
  /** Said in the premium warning: what each call is for. */
  usage?: string;
  disabled?: boolean;
  onSave: (modelId: string) => void;
}) {
  const [pending, setPending] = useState<ModelOption | null>(null);

  const select = (modelId: string) => {
    const model = props.models?.find((entry) => entry.id === modelId);
    if (model?.expensive && modelId !== props.value) {
      setPending(model);
      return;
    }
    setPending(null);
    props.onSave(modelId);
  };

  return (
    <>
      <SettingRow label={props.label} description={props.description} htmlFor={props.id}>
        <ModelPicker
          id={props.id}
          value={props.value ?? ""}
          models={props.models}
          defaultLabel={props.defaultLabel}
          filter={props.filter}
          error={props.modelsError}
          disabled={props.disabled || props.value === undefined}
          onSelect={select}
        />
      </SettingRow>
      {pending ? (
        <div
          role="alert"
          className="grid gap-2 rounded-lg border border-destructive/40 p-3 text-xs"
        >
          <p>
            <span className="font-medium">{pending.label}</span> is a premium model (
            {formatModelPrice(pending)}). {props.usage ?? "Every call"} is paid from the shared AI
            budget, so a costly model adds up quickly.
          </p>
          <div className="flex gap-2">
            <Button
              size="xs"
              onClick={() => {
                setPending(null);
                props.onSave(pending.id);
              }}
            >
              Use anyway
            </Button>
            <Button variant="outline" size="xs" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** A stable function, so the picker doesn't rebuild its list on every render. */
const canRunAssistant = (model: ModelOption) => model.chatCapable;

function GeneralSettings(props: GeneralProps) {
  const { settings, loadError, saveError, load, update } = props.userSettings;
  const { models, defaultModel, error: modelsError, load: loadModels } = useModelOptions();

  useEffect(() => {
    void load();
    void loadModels();
  }, [load, loadModels]);

  return (
    <div className="grid gap-6">
      <SettingsSection title="Assistant">
        <ModelSetting
          id="settings-chat-model"
          label="Chat model"
          description="The model that answers you. Only models that can use tools are listed, because the assistant needs them."
          value={settings?.chatModel}
          models={models}
          modelsError={modelsError}
          defaultLabel={defaultModel ? `Server default (${defaultModel.slug})` : "Server default"}
          filter={canRunAssistant}
          usage="Every reply"
          onSave={(chatModel) => void update({ chatModel })}
        />
      </SettingsSection>

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
        <ModelSetting
          id="settings-title-model"
          label="Title model"
          description="Writes a short title for each new chat."
          value={settings?.titleModel}
          models={models}
          modelsError={modelsError}
          defaultLabel="Same as chat model"
          usage="Every new chat's title"
          onSave={(titleModel) => void update({ titleModel })}
        />
      </SettingsSection>

      <SettingsSection title="Chat history">
        <SettingRow
          label="Summarise older messages"
          description="Long chats keep their newest messages in full and replace older ones with short summaries. This is cheaper and faster, and the assistant can still look up anything said earlier."
          htmlFor="settings-history-compaction"
        >
          <Switch
            id="settings-history-compaction"
            checked={settings?.historyCompaction ?? true}
            disabled={!settings}
            onCheckedChange={(historyCompaction) => void update({ historyCompaction })}
          />
        </SettingRow>
        <ModelSetting
          id="settings-history-summary-model"
          label="Summary model"
          description="Writes those summaries. A small, fast model is plenty."
          value={settings?.historySummaryModel}
          models={models}
          modelsError={modelsError}
          defaultLabel="Same as chat model"
          usage="Every summary"
          disabled={settings?.historyCompaction === false}
          onSave={(historySummaryModel) => void update({ historySummaryModel })}
        />
      </SettingsSection>

      {loadError ? (
        <p className="flex items-center gap-2 text-destructive text-xs">
          Could not load settings: {loadError}
          <Button variant="outline" size="xs" onClick={() => void load()}>
            Retry
          </Button>
        </p>
      ) : null}
      {modelsError ? (
        <p className="flex items-center gap-2 text-destructive text-xs">
          Could not load the model list: {modelsError}
          <Button variant="outline" size="xs" onClick={() => void loadModels()}>
            Retry
          </Button>
        </p>
      ) : null}
      {saveError ? (
        <p className="text-destructive text-xs">Could not save settings: {saveError}</p>
      ) : null}
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  category,
  onCategoryChange,
  pendingMemories,
  memory,
  materials,
  ...general
}: Props) {
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
                onClick={() => onCategoryChange(entry.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  entry.id === category && "bg-muted font-medium",
                )}
              >
                <entry.icon className="size-4" />
                {entry.label}
                {entry.id === "context" && pendingMemories > 0 ? (
                  <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-primary-soft px-1.5 text-primary-soft-foreground text-xs tabular-nums">
                    {pendingMemories}
                    <span className="sr-only"> memories to review</span>
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <h2 className="mb-4 font-semibold text-base">{active.label}</h2>
            {category === "general" ? <GeneralSettings {...general} /> : null}
            {category === "context" ? (
              <ContextSettings memory={memory} materials={materials} />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
