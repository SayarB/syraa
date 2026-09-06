import { createAuthClient } from "better-auth/react";

/** Same-origin client — Vite proxies `/api/auth` to the harness API. */
export const authClient = createAuthClient();
