import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Same-origin client — Vite proxies `/api/auth` to the harness API. */
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
