import type {
  AuthAdapter,
  AuthorizeArgs,
  Identity,
  RecordAuthorizeArgs,
  RecordScope,
  ScopeArgs,
} from "@comp/core";
import { readCookie, serializeCookie, type CookieOptions } from "./cookie.js";
import { signSession, verifySession, type SessionPayload } from "./session.js";

export interface PasskeyAuthOptions {
  /** HMAC secret for session tokens. */
  secret: string;
  /** Session cookie name. Defaults to "comp_session". */
  cookieName?: string;
  /** Authorize an operation for the resolved identity. */
  authorize: (args: AuthorizeArgs) => boolean | Promise<boolean>;
  /** Cookie attributes (e.g. `secure: false` for local http). */
  cookie?: CookieOptions;
  /**
   * Which rows this identity may see, as column conditions. Optional, and
   * passed straight through: whether access depends on the row is the app's
   * question, and an adapter that does not answer it costs nothing.
   */
  scope?: (args: ScopeArgs) => RecordScope | null | Promise<RecordScope | null>;
  /** Decide an operation again with the row in hand. */
  authorizeRecord?: (args: RecordAuthorizeArgs) => boolean | Promise<boolean>;
}

export interface PasskeyAuth extends AuthAdapter {
  /** Mint a session and return the `Set-Cookie` header value. */
  issueSession(payload: SessionPayload, maxAgeSeconds: number): Promise<string>;
  /** Return a `Set-Cookie` value that clears the session. */
  clearSession(): string;
}

/**
 * Auth adapter backed by signed-session cookies. Identity is whatever a
 * successful passkey login put in the session; authorization is delegated to
 * the provided policy. Drop-in for `createAdminRouter({ auth })` — no call site
 * changes versus the allow-all default.
 */
export function createPasskeyAuth(options: PasskeyAuthOptions): PasskeyAuth {
  const cookieName = options.cookieName ?? "comp_session";

  return {
    async authenticate(request: Request): Promise<Identity | null> {
      const token = readCookie(request, cookieName);
      if (!token) return null;
      const payload = await verifySession(token, options.secret);
      if (!payload) return null;
      return { ...payload, subject: payload.subject, roles: payload.roles };
    },
    authorize(args) {
      return options.authorize(args);
    },
    // Spread rather than defined unconditionally: a transport checks whether
    // these exist to decide whether to read a row it would not otherwise need.
    ...(options.scope ? { scope: options.scope } : {}),
    ...(options.authorizeRecord
      ? { authorizeRecord: options.authorizeRecord }
      : {}),
    async issueSession(payload, maxAgeSeconds) {
      const exp = Date.now() + maxAgeSeconds * 1000;
      const token = await signSession({ ...payload, exp }, options.secret);
      return serializeCookie(cookieName, token, {
        ...options.cookie,
        maxAge: maxAgeSeconds,
      });
    },
    clearSession() {
      return serializeCookie(cookieName, "", { ...options.cookie, maxAge: 0 });
    },
  };
}
