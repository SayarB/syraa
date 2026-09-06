import type { IncomingMessage } from "node:http";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { fromNodeHeaders } from "better-auth/node";
import { Pool } from "pg";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type AuthUser = {
  userId: string;
  email: string;
};

export type AuthProvidersStatus = {
  google: boolean;
  magicLink: boolean;
};

type AuthInstance = ReturnType<typeof betterAuth>;

let authInstance: AuthInstance | null = null;
let pool: Pool | null = null;

export function isBetterAuthConfigured(): boolean {
  return Boolean(process.env.BETTER_AUTH_SECRET?.trim());
}

export function authProvidersStatus(): AuthProvidersStatus {
  return {
    google: Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
    ),
    magicLink: true,
  };
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required for Better Auth");
  }
  return url;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Public browser origins allowed for CSRF / cookies. */
export function trustedOrigins(): string[] {
  const origins = new Set<string>();
  const base = process.env.BETTER_AUTH_URL?.trim();
  if (base) origins.add(base.replace(/\/$/, ""));

  const extra = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.trim();
  if (extra) {
    for (const part of extra.split(",")) {
      const origin = part.trim().replace(/\/$/, "");
      if (origin) origins.add(origin);
    }
  }

  if (!isProduction()) {
    origins.add("http://localhost:5173");
    origins.add("http://127.0.0.1:5173");
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return [...origins];
}

function trustProxyHeaders(): boolean {
  const flag = process.env.TRUST_PROXY?.trim().toLowerCase();
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  return isProduction();
}

function googleSocialProvider():
  | { google: { clientId: string; clientSecret: string; prompt: "select_account" } }
  | undefined {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return undefined;
  return {
    google: {
      clientId,
      clientSecret,
      prompt: "select_account",
    },
  };
}

async function sendMagicLinkEmail(input: { email: string; url: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "SYRAA <onboarding@resend.dev>";

  if (apiKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        subject: "Sign in to SYRAA",
        html: `<p>Sign in to SYRAA:</p><p><a href="${input.url}">Continue</a></p><p>Or paste this link:<br/>${input.url}</p>`,
        text: `Sign in to SYRAA: ${input.url}`,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Failed to send magic link (${res.status})${body ? `: ${body}` : ""}`);
    }
    return;
  }

  console.info(`[magic-link] ${input.email} → ${input.url}`);
  if (isProduction()) {
    throw new Error("Email delivery is not configured (set RESEND_API_KEY and EMAIL_FROM)");
  }
}

/** Shared options for runtime + migrate (keep in sync). */
export function buildBetterAuthOptions(database: Pool): Parameters<typeof betterAuth>[0] {
  const baseURL = process.env.BETTER_AUTH_URL?.trim();
  if (isProduction() && !baseURL) {
    throw new Error("BETTER_AUTH_URL is required in production (public https origin)");
  }

  const google = googleSocialProvider();

  return {
    database,
    baseURL: baseURL || "http://localhost:5173",
    secret: process.env.BETTER_AUTH_SECRET!.trim(),
    trustedOrigins: trustedOrigins(),
    emailAndPassword: {
      enabled: false,
    },
    ...(google ? { socialProviders: google } : {}),
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLinkEmail({ email, url });
        },
      }),
    ],
    advanced: {
      trustedProxyHeaders: trustProxyHeaders(),
      useSecureCookies: baseURL?.startsWith("https://") === true,
    },
  };
}

function createAuth(): ReturnType<typeof betterAuth> {
  pool = new Pool({ connectionString: databaseUrl() });
  return betterAuth(buildBetterAuthOptions(pool));
}

export function getAuth(): ReturnType<typeof betterAuth> {
  if (!isBetterAuthConfigured()) {
    throw new Error("Better Auth is not configured (set BETTER_AUTH_SECRET)");
  }
  if (!authInstance) {
    authInstance = createAuth();
  }
  return authInstance;
}

/** Test helper — clears cached auth/pool. */
export function resetBetterAuthForTests(): void {
  authInstance = null;
  if (pool) {
    void pool.end().catch(() => undefined);
  }
  pool = null;
}

/**
 * Resolve the signed-in user.
 * - Better Auth session cookie when `BETTER_AUTH_SECRET` is set
 * - `AUTH_DEV_USER` only when secret is unset (tests / local without auth)
 */
export async function requireUser(req: IncomingMessage): Promise<AuthUser> {
  if (!isBetterAuthConfigured()) {
    const devUser = process.env.AUTH_DEV_USER?.trim();
    if (devUser) {
      return { userId: devUser, email: `${devUser}@localhost` };
    }
    throw new UnauthorizedError("Authentication is not configured");
  }

  const auth = getAuth();
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session?.user?.id) {
    throw new UnauthorizedError("Not signed in");
  }

  return {
    userId: session.user.id,
    email: session.user.email,
  };
}

export async function requireUserId(req: IncomingMessage): Promise<string> {
  const user = await requireUser(req);
  return user.userId;
}
