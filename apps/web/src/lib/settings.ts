import { useCallback, useRef, useState } from "react";
import { apiFetch } from "./api";

export type ModelOption = { id: string; label: string };

/** Mirrors the harness `UserSettings`; every field has a server-side default. */
export type UserSettings = {
  titleModel: string;
};

export type SettingsOptions = {
  titleModels: ModelOption[];
};

type SettingsResponse = {
  settings: UserSettings;
  options: SettingsOptions;
};

async function readSettingsResponse(res: Response): Promise<SettingsResponse> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as SettingsResponse;
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
  const [options, setOptions] = useState<SettingsOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Saves run one at a time, in order, so the last change is also the last one stored; only the
  // newest save's response is shown.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const latestSave = useRef(0);

  const apply = useCallback((data: SettingsResponse) => {
    setSettings(data.settings);
    setOptions(data.options);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      apply(await readSettingsResponse(await apiFetch("/api/settings")));
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
          const data = await readSettingsResponse(res);
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

  return { settings, options, loadError, saveError, load, update };
}
