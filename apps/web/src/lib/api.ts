/** Base URL for harness API. Empty in Vite dev (proxy). Desktop builds set VITE_API_BASE. */
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.headers ?? {}),
    },
  });
}
