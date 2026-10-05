import { useCallback, useState } from "react";
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

/**
 * Account settings stored by the harness (`/api/settings`). Theme is not here — it lives on the
 * auth user and is handled by `useTheme`.
 */
export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [options, setOptions] = useState<SettingsOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((data: SettingsResponse) => {
    setSettings(data.settings);
    setOptions(data.options);
    setError(null);
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await readSettingsResponse(await apiFetch("/api/settings")));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [apply]);

  const update = useCallback(
    async (patch: Partial<UserSettings>) => {
      const previous = settings;
      if (previous) setSettings({ ...previous, ...patch });
      try {
        const res = await apiFetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        apply(await readSettingsResponse(res));
      } catch (err) {
        setSettings(previous);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [settings, apply],
  );

  return { settings, options, error, load, update };
}
