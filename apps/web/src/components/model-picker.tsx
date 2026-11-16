import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type ModelOption, SAME_AS_CHAT_MODEL } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** "$0.25 in · $2 out per 1M tokens", or nothing when the provider lists no price. */
export function formatModelPrice(model: ModelOption): string {
  const usd = (value: number) => `$${value >= 10 ? value.toFixed(0) : Number(value.toFixed(2))}`;
  if (model.inputPerMillion === undefined && model.outputPerMillion === undefined) return "";
  const parts = [
    model.inputPerMillion !== undefined ? `${usd(model.inputPerMillion)} in` : null,
    model.outputPerMillion !== undefined ? `${usd(model.outputPerMillion)} out` : null,
  ].filter(Boolean);
  return `${parts.join(" · ")} per 1M tokens`;
}

/** "128k context", "1M context", or nothing when unknown. */
export function formatContext(model: ModelOption): string {
  const tokens = model.contextWindow;
  if (!tokens) return "";
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M context`;
  return `${Math.round(tokens / 1000)}k context`;
}

/** What to show under a model's name: its price and context size, or its id if neither is known. */
function modelDetails(model: ModelOption): string {
  return [formatModelPrice(model), formatContext(model)].filter(Boolean).join(" · ") || model.slug;
}

type Props = {
  id: string;
  value: string;
  models: ModelOption[] | null;
  /** What the "chat" value is called here: the server default, or "same as chat model". */
  defaultLabel: string;
  /** Offer only some models (e.g. those that can run the assistant). A saved model outside it still shows. */
  filter?: (model: ModelOption) => boolean;
  /** Shown instead of the list when the models could not be loaded. */
  error?: string | null;
  disabled?: boolean;
  onSelect: (modelId: string) => void;
};

/**
 * A searchable list of models, grouped by who makes them. Hundreds of models are offered, so a plain
 * dropdown would be unusable. The default is always first.
 */
export function ModelPicker({
  id,
  value,
  models,
  defaultLabel,
  filter,
  error,
  disabled,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    const byGroup = new Map<string, ModelOption[]>();
    for (const model of models ?? []) {
      if (filter && !filter(model)) continue;
      byGroup.set(model.group, [...(byGroup.get(model.group) ?? []), model]);
    }
    return [...byGroup.entries()];
  }, [models, filter]);

  // Look the saved value up in every model, not only the offered ones: it may predate the filter.
  const selected = models?.find((model) => model.id === value);
  const triggerText =
    value === SAME_AS_CHAT_MODEL
      ? defaultLabel
      : (selected?.label ?? (models ? `${value} (no longer offered)` : value));

  const choose = (modelId: string) => {
    setOpen(false);
    onSelect(modelId);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-64 justify-between font-normal"
        >
          <span className="truncate">{error ? "Models unavailable" : triggerText}</span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <Command>
          <CommandInput placeholder="Search models…" />
          <CommandList>
            <CommandEmpty>
              {error ? `Could not load models: ${error}` : "No model found."}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`${defaultLabel} default`}
                onSelect={() => choose(SAME_AS_CHAT_MODEL)}
              >
                <span className="min-w-0 flex-1 truncate">{defaultLabel}</span>
                {value === SAME_AS_CHAT_MODEL ? <CheckIcon className="size-3.5" /> : null}
              </CommandItem>
            </CommandGroup>
            {groups.map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((model) => (
                  <CommandItem
                    key={model.id}
                    // cmdk filters on this string: match the name and the slug.
                    value={`${model.label} ${model.slug}`}
                    onSelect={() => choose(model.id)}
                  >
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate">{model.label}</span>
                      <span className="truncate text-muted-foreground text-xs">
                        {modelDetails(model)}
                      </span>
                    </span>
                    {model.expensive ? (
                      <Badge variant="outline" className="shrink-0">
                        Premium
                      </Badge>
                    ) : null}
                    <CheckIcon
                      className={cn(
                        "size-3.5 shrink-0",
                        model.id === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
