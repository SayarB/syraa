import { useCallback, useEffect, useState } from "react";
import { authClient } from "./auth-client";

/** Palettes defined in src/index.css. `swatch` is the dark-mode accent, used in the picker. */
export const THEME_PALETTES = [
  { id: "sage", label: "Slate & Sage", swatch: "#8fa89a" },
  { id: "stone", label: "Warm Stone", swatch: "#b8a27e" },
  { id: "dusk", label: "Dusk Blue", swatch: "#8497b3" },
  { id: "ash", label: "Plum Ash", swatch: "#a393a8" },
  { id: "olive", label: "Olive Graphite", swatch: "#a6a47f" },
] as const;

export type ThemePalette = (typeof THEME_PALETTES)[number]["id"];
export type ThemeMode = "dark" | "light";
export type Theme = { palette: ThemePalette; mode: ThemeMode };

/** What /api/me returns: either field may be unset for a new account. */
export type SavedTheme = { palette: string | null; mode: string | null };

/** Keep in sync with the pre-paint script in index.html. */
const STORAGE_KEY = "syraa:theme";

function isPalette(value: unknown): value is ThemePalette {
  return THEME_PALETTES.some((palette) => palette.id === value);
}

function isMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

function systemMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function loadCachedTheme(): Theme {
  const fallback: Theme = { palette: "sage", mode: systemMode() };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Theme>;
    return {
      palette: isPalette(parsed.palette) ? parsed.palette : fallback.palette,
      mode: isMode(parsed.mode) ? parsed.mode : fallback.mode,
    };
  } catch {
    return fallback;
  }
}

function cacheTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // private mode / storage blocked — the account copy still applies on next sign-in
  }
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme.mode === "dark");
  if (theme.palette === "sage") {
    delete root.dataset.palette;
  } else {
    root.dataset.palette = theme.palette;
  }
}

async function saveThemeToAccount(theme: Theme): Promise<void> {
  const result = await authClient.updateUser({
    themePalette: theme.palette,
    themeMode: theme.mode,
  });
  if (result.error) {
    throw new Error(result.error.message ?? "Could not save theme");
  }
}

/**
 * Current theme plus setters.
 * - Starts from the browser cache so the first paint matches the last session.
 * - `adoptSaved` takes the account's saved theme once the user is known.
 * - Changes are cached locally and, when `saveToAccount` is true, stored on the account.
 */
export function useTheme(saveToAccount: boolean) {
  const [theme, setTheme] = useState<Theme>(loadCachedTheme);

  useEffect(() => {
    applyTheme(theme);
    cacheTheme(theme);
  }, [theme]);

  const update = useCallback(
    (next: Theme) => {
      setTheme(next);
      if (!saveToAccount) return;
      saveThemeToAccount(next).catch((err: unknown) => {
        console.error("Theme not saved to account", err);
      });
    },
    [saveToAccount],
  );

  const setPalette = useCallback(
    (palette: ThemePalette) => update({ ...theme, palette }),
    [theme, update],
  );

  const toggleMode = useCallback(
    () => update({ ...theme, mode: theme.mode === "dark" ? "light" : "dark" }),
    [theme, update],
  );

  const adoptSaved = useCallback((saved: SavedTheme | undefined) => {
    if (!saved) return;
    setTheme((current) => ({
      palette: isPalette(saved.palette) ? saved.palette : current.palette,
      mode: isMode(saved.mode) ? saved.mode : current.mode,
    }));
  }, []);

  return { theme, setPalette, toggleMode, adoptSaved };
}
