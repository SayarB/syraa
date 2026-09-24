import { inferAdditionalFields, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Same-origin client — Vite proxies `/api/auth` to the harness API. */
export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    // Mirrors user.additionalFields in packages/harness/src/auth/better-auth.ts
    inferAdditionalFields({
      user: {
        themePalette: { type: "string", required: false },
        themeMode: { type: "string", required: false },
      },
    }),
  ],
});
