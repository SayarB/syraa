import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import {
  isBetterAuthConfigured,
  requireUserId,
  resetBetterAuthForTests,
  trustedOrigins,
  UnauthorizedError,
} from "../src/auth/better-auth.js";

function mockReq(): IncomingMessage {
  return { headers: {} } as IncomingMessage;
}

describe("requireUserId / AUTH_DEV_USER", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetBetterAuthForTests();
  });

  it("returns AUTH_DEV_USER when Better Auth secret is unset", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("AUTH_DEV_USER", "dev-user");
    expect(isBetterAuthConfigured()).toBe(false);
    await expect(requireUserId(mockReq())).resolves.toBe("dev-user");
  });

  it("throws when secret unset and no AUTH_DEV_USER", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("AUTH_DEV_USER", "");
    await expect(requireUserId(mockReq())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("requires a session when Better Auth is configured", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:5173");
    vi.stubEnv("DATABASE_URL", "postgresql://syraa:syraa@localhost:5432/syraa");
    vi.stubEnv("AUTH_DEV_USER", "dev-user");
    expect(isBetterAuthConfigured()).toBe(true);
    await expect(requireUserId(mockReq())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("trustedOrigins includes BETTER_AUTH_URL and extras", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://syraa.example.com");
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "https://alt.example.com/");
    expect(trustedOrigins()).toEqual([
      "https://syraa.example.com",
      "https://alt.example.com",
    ]);
  });
});
