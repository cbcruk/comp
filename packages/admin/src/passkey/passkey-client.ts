import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PasskeyClient,
  PasskeyClientOptions,
  WebAuthnBrowser,
} from "./passkey-client.types.js";

type RegistrationOptionsJSON = Parameters<
  typeof startRegistration
>[0]["optionsJSON"];
type AuthenticationOptionsJSON = Parameters<
  typeof startAuthentication
>[0]["optionsJSON"];

/**
 * Browser-side passkey client: drives the WebAuthn ceremonies against the
 * `@comp/auth` endpoints. Fetch and the WebAuthn functions are injectable so
 * the orchestration is testable without a real authenticator.
 */
export function createPasskeyClient(
  options: PasskeyClientOptions,
): PasskeyClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  const webauthn: WebAuthnBrowser = options.webauthn ?? {
    startRegistration,
    startAuthentication,
  };

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetchImpl(`${base}${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message =
        typeof data === "object" && data !== null && "error" in data
          ? String((data as { error: unknown }).error)
          : `Request failed with status ${response.status}`;
      throw new Error(message);
    }
    return data as T;
  }

  return {
    async register(userId, userName) {
      const optionsJSON = await post<RegistrationOptionsJSON>(
        "/register/options",
        { userId, userName },
      );
      const response = await webauthn.startRegistration({ optionsJSON });
      await post("/register/verify", { userId, userName, response });
    },
    async login(userId) {
      const optionsJSON = await post<AuthenticationOptionsJSON>(
        "/login/options",
        { userId },
      );
      const response = await webauthn.startAuthentication({ optionsJSON });
      await post("/login/verify", { userId, response });
    },
    async logout() {
      await post("/logout", {});
    },
  };
}
