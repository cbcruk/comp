import { describe, expect, it, vi } from "vitest";
import { createPasskeyClient } from "./passkey-client.js";
import type { WebAuthnBrowser } from "./passkey-client.types.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const webauthn = {
  startRegistration: vi.fn(async () => ({ id: "new-cred" })),
  startAuthentication: vi.fn(async () => ({ id: "assert-cred" })),
} as unknown as WebAuthnBrowser;

describe("createPasskeyClient", () => {
  it("runs the registration ceremony end to end", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      if (url.endsWith("/register/options")) {
        return jsonResponse({ challenge: "abc" });
      }
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;

    const client = createPasskeyClient({ baseUrl: "/auth", fetch: fetchImpl, webauthn });
    await client.register("u1", "User One");

    expect(calls[0]?.url).toBe("/auth/register/options");
    expect(calls[1]?.url).toBe("/auth/register/verify");
    expect(calls[1]?.body).toMatchObject({
      userId: "u1",
      response: { id: "new-cred" },
    });
  });

  it("runs the login ceremony and surfaces server errors", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/login/options")) return jsonResponse({ challenge: "x" });
      return jsonResponse({ error: "Authentication could not be verified" }, 400);
    }) as unknown as typeof fetch;

    const client = createPasskeyClient({ baseUrl: "/auth", fetch: fetchImpl, webauthn });
    await expect(client.login("u1")).rejects.toThrow(/could not be verified/);
  });
});
