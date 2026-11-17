import { useCallback, useRef, useState } from "react";
import { apiFetch } from "./api";
import type { ChatConfig } from "./types";

/** A model a setting can use, as listed by the server (`/api/settings/models`). */
export type ModelOption = {
  /** The value that is saved: `provider:slug`. */
  id: string;
  providerId: string;
  /** The provider's own name for the model. */
  slug: string;
  label: string;
  /** Picker heading. */
  group: string;
  /** US dollars per million tokens. */
  inputPerMillion?: number;
  outputPerMillion?: number;
  /** Costly enough to warn about: the app's own key pays for every call. */
  expensive?: boolean;
  /** Tokens of context the model accepts, when the provider says. */
  contextWindow?: number;
  /** Can run the assistant: it can call tools and has room for the conversation. */
  chatCapable: boolean;
};

/** Setting value meaning "the server's default model" (for the title and summary models: the chat model). */
export const SAME_AS_CHAT_MODEL = "chat";

/**
 * "provider · model" for the model that answers this user: their chat model setting, or the
 * server's default model when they chose none (or their settings haven't loaded yet).
 */
export function chatModelLabel(serverDefault: ChatConfig, chatModel: string | undefined): string {
  const short = (slug: string) => slug.split("/").pop() ?? slug;
  if (!chatModel || chatModel === SAME_AS_CHAT_MODEL) {
    return `${serverDefault.provider} · ${short(serverDefault.model)}`;
  }
  // The server stores `provider:slug`; a slug may itself contain colons, so split on the first.
  const colon = chatModel.indexOf(":");
  if (colon <= 0) return `${serverDefault.provider} · ${short(chatModel)}`;
  return `${chatModel.slice(0, colon)} · ${short(chatModel.slice(colon + 1))}`;
}

/** Mirrors the harness `UserSettings`; every field has a server-side default. */
export type UserSettings = {
  chatModel: string;
  titleModel: string;
  historyCompaction: boolean;
  historySummaryModel: string;
};

type SettingsResponse = {
  settings: UserSettings;
};

export type ModelOptionsResponse = {
  /** The server's default model: what "chat" means. */
  defaultModel: { id: string; providerId: string; slug: string };
  /** Providers with a key, and whether their model list could be loaded. */
  providers: { id: string; label: string; ok: boolean }[];
  models: ModelOption[];
};

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Account settings stored by the harness (`/api/settings`). Theme is not here — it lives on the
 * auth user and is handled by `useTheme`.
 */
export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Saves run one at a time, in order, so the last change is also the last one stored; only the
  // newest save's response is shown.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const latestSave = useRef(0);

  const apply = useCallback((data: SettingsResponse) => {
    setSettings(data.settings);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      apply(await readJson<SettingsResponse>(await apiFetch("/api/settings")));
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, [apply]);

  const update = useCallback(
    (patch: Partial<UserSettings>) => {
      const save = ++latestSave.current;
      setSaveError(null);
      setSettings((current) => (current ? { ...current, ...patch } : current));

      const run = async () => {
        try {
          const res = await apiFetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          const data = await readJson<SettingsResponse>(res);
          if (save === latestSave.current) apply(data);
        } catch (err) {
          if (save !== latestSave.current) return;
          setSaveError(errorText(err));
          // Show what is actually stored instead of the failed optimistic value.
          await load();
        }
      };
      saveQueue.current = saveQueue.current.then(run);
      return saveQueue.current;
    },
    [apply, load],
  );

  /** Forget the loaded settings (on sign-out), so the next user never sees them. */
  const reset = useCallback(() => {
    latestSave.current++;
    setSettings(null);
    setLoadError(null);
    setSaveError(null);
  }, []);

  return { settings, loadError, saveError, load, update, reset };
}

/**
 * Models the pickers offer, loaded apart from the settings: on the AI gateway it is a list of
 * hundreds. `models` is null until loaded.
 */
export function useModelOptions() {
  const [options, setOptions] = useState<ModelOptionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOptions(await readJson<ModelOptionsResponse>(await apiFetch("/api/settings/models")));
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  return {
    models: options?.models ?? null,
    defaultModel: options?.defaultModel ?? null,
    providers: options?.providers ?? [],
    error,
    load,
  };
}
