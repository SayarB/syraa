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

type Props = {
  id: string;
  value: string;
  models: ModelOption[] | null;
  /** Shown instead of the list when the models could not be loaded. */
  error?: string | null;
  disabled?: boolean;
  onSelect: (modelId: string) => void;
};

/**
 * A searchable list of models, grouped by who makes them. Hundreds of models are offered, so a plain
 * dropdown would be unusable. "Same as chat model" is always first.
 */
export function ModelPicker({ id, value, models, error, disabled, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    const byProvider = new Map<string, ModelOption[]>();
    for (const model of models ?? []) {
      const provider = model.provider ?? "other";
      byProvider.set(provider, [...(byProvider.get(provider) ?? []), model]);
    }
    return [...byProvider.entries()];
  }, [models]);

  const selected = models?.find((model) => model.id === value);
  const triggerText =
    value === SAME_AS_CHAT_MODEL
      ? "Same as chat model"
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
                value="same as chat model default"
                onSelect={() => choose(SAME_AS_CHAT_MODEL)}
              >
                <span className="min-w-0 flex-1 truncate">Same as chat model</span>
                {value === SAME_AS_CHAT_MODEL ? <CheckIcon className="size-3.5" /> : null}
              </CommandItem>
            </CommandGroup>
            {groups.map(([provider, items]) => (
              <CommandGroup key={provider} heading={provider}>
                {items.map((model) => (
                  <CommandItem
                    key={model.id}
                    // cmdk filters on this string: match the name and the slug.
                    value={`${model.label} ${model.id}`}
                    onSelect={() => choose(model.id)}
                  >
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate">{model.label}</span>
                      <span className="truncate text-muted-foreground text-xs">
                        {formatModelPrice(model) || model.id}
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
