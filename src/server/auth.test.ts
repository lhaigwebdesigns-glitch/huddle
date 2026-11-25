import { describe, expect, it } from "vitest";
import { cookie, enabledProviders, parseCookies, safeReturn, sha256 } from "./auth";

describe("auth helpers", () => {
  it("parses and writes cookies", () => {
    expect(parseCookies("a=1; huddle_session=abc%3D; x")).toEqual({ a: "1", huddle_session: "abc=" });
    const c = cookie("huddle_session", "t", { maxAge: 60, secure: true });
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Secure");
  });

  it("only enables configured providers; dev only when asked", () => {
    expect(enabledProviders({} as any)).toEqual([]);
    // Google only: GitHub keys, even if still set, don't add a GitHub button.
    expect(enabledProviders({ GITHUB_CLIENT_ID: "a", GITHUB_CLIENT_SECRET: "b" } as any)).toEqual([]);
    expect(enabledProviders({ GITHUB_CLIENT_ID: "a", GITHUB_CLIENT_SECRET: "b", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "d" } as any)).toEqual(["google"]);
    expect(enabledProviders({ GOOGLE_CLIENT_ID: "a" } as any)).toEqual([]); // secret missing
    expect(enabledProviders({ DEV_AUTH: "1" } as any)).toEqual(["dev"]);
  });

  it("blocks open redirects", () => {
    expect(safeReturn("/r/ABC123")).toBe("/r/ABC123");
    expect(safeReturn("//evil.example")).toBe("/dashboard");
    expect(safeReturn("https://evil.example")).toBe("/dashboard");
    expect(safeReturn(undefined)).toBe("/dashboard");
    expect(safeReturn("/")).toBe("/dashboard");
  });

  it("hashes tokens", async () => {
    expect(await sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("admin by Google account", () => {
  it("only a Google sign-in with a listed email is an admin", async () => {
    const { isAdminUser } = await import("./auth");
    const env = { ADMIN_EMAILS: "Owner@Example.com, second@example.com" } as any;
    const user = (provider: string, email: string | null) => ({ id: "1", uid: "u", name: "n", avatar: null, provider, email });
    expect(isAdminUser(env, user("google", "owner@example.com"))).toBe(true);
    expect(isAdminUser(env, user("google", "second@example.com"))).toBe(true);
    expect(isAdminUser(env, user("github", "owner@example.com"))).toBe(false);
    expect(isAdminUser(env, user("google", "someone@example.com"))).toBe(false);
    expect(isAdminUser(env, user("google", null))).toBe(false);
    expect(isAdminUser({} as any, user("google", "owner@example.com"))).toBe(false);
    expect(isAdminUser(env, null)).toBe(false);
  });
});
