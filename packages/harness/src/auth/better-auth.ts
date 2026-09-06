import type { IncomingMessage } from "node:http";
import { betterAuth } from "better-auth";
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

type AuthInstance = ReturnType<typeof createAuth>;

let authInstance: AuthInstance | null = null;
let pool: Pool | null = null;

export function isBetterAuthConfigured(): boolean {
  return Boolean(process.env.BETTER_AUTH_SECRET?.trim());
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
  // Dokploy / Traefik terminate TLS; enable by default in production.
  return isProduction();
}

function createAuth() {
  const baseURL = process.env.BETTER_AUTH_URL?.trim();
  if (isProduction() && !baseURL) {
    throw new Error("BETTER_AUTH_URL is required in production (public https origin)");
  }

  pool = new Pool({ connectionString: databaseUrl() });
  return betterAuth({
    database: pool,
    baseURL: baseURL || "http://localhost:5173",
    secret: process.env.BETTER_AUTH_SECRET!.trim(),
    trustedOrigins: trustedOrigins(),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    advanced: {
      trustedProxyHeaders: trustProxyHeaders(),
      // Only Secure cookies when the public URL is https (local Docker uses http://localhost:3000).
      useSecureCookies: baseURL?.startsWith("https://") === true,
    },
  });
}

export function getAuth(): AuthInstance {
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
