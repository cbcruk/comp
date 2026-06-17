import type {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

/** The browser WebAuthn ceremony functions; injectable for testing. */
export interface WebAuthnBrowser {
  startRegistration: typeof startRegistration;
  startAuthentication: typeof startAuthentication;
}

export interface PasskeyClientOptions {
  /** Base URL where the auth routes are mounted, e.g. "/auth". */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  webauthn?: WebAuthnBrowser;
}

export interface PasskeyClient {
  register(userId: string, userName: string): Promise<void>;
  login(userId: string): Promise<void>;
  logout(): Promise<void>;
}
