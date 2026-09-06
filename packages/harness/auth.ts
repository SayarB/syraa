/**
 * Better Auth CLI config (`npx auth migrate --config ./auth.ts`).
 * Prefer `npm run auth:migrate` (programmatic) for local + Docker.
 */
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { Pool } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });

const secret = process.env.BETTER_AUTH_SECRET?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!secret || !databaseUrl) {
  throw new Error("Set BETTER_AUTH_SECRET and DATABASE_URL before running auth migrate");
}

const googleId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

export const auth = betterAuth({
  database: new Pool({ connectionString: databaseUrl }),
  baseURL: process.env.BETTER_AUTH_URL?.trim() || "http://localhost:5173",
  secret,
  emailAndPassword: {
    enabled: false,
  },
  ...(googleId && googleSecret
    ? {
        socialProviders: {
          google: {
            clientId: googleId,
            clientSecret: googleSecret,
          },
        },
      }
    : {}),
  plugins: [
    magicLink({
      sendMagicLink: async () => {
        // CLI migrate only — delivery unused
      },
    }),
  ],
});
