import { Hono } from "hono";
import type { PasskeyAuth } from "./create-passkey-auth.js";
import type { PasskeyStore } from "./passkey-store.types.js";
import type { SessionPayload } from "./session.js";
import {
  finishAuthentication,
  finishRegistration,
  startAuthentication,
  startRegistration,
  type AuthenticationResponse,
  type RegistrationResponse,
  type RpInfo,
} from "./webauthn.js";

const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export interface AuthRoutesConfig {
  store: PasskeyStore;
  rp: RpInfo;
  auth: PasskeyAuth;
  sessionMaxAge?: number;
  /** Build the session payload for a verified user. Defaults to no roles. */
  resolveIdentity?: (userId: string) => SessionPayload | Promise<SessionPayload>;
}

/**
 * Hono router for the passkey ceremonies and session lifecycle:
 * register/options, register/verify, login/options, login/verify, logout.
 * Mount it alongside the admin router; on a verified login it sets the session
 * cookie the auth adapter reads.
 */
export function createAuthRoutes(config: AuthRoutesConfig): Hono {
  const app = new Hono();
  const maxAge = config.sessionMaxAge ?? DEFAULT_SESSION_MAX_AGE;
  const resolveIdentity =
    config.resolveIdentity ?? ((userId: string) => ({ subject: userId, roles: [] }));

  app.post("/register/options", async (c) => {
    const { userId, userName } = await c.req.json<{
      userId: string;
      userName: string;
    }>();
    const options = await startRegistration(config.store, config.rp, {
      id: userId,
      name: userName,
    });
    return c.json(options);
  });

  app.post("/register/verify", async (c) => {
    const { userId, userName, response } = await c.req.json<{
      userId: string;
      userName: string;
      response: RegistrationResponse;
    }>();
    await finishRegistration(
      config.store,
      config.rp,
      { id: userId, name: userName },
      response,
    );
    return c.json({ ok: true });
  });

  app.post("/login/options", async (c) => {
    const { userId } = await c.req.json<{ userId: string }>();
    const options = await startAuthentication(config.store, config.rp, {
      id: userId,
      name: userId,
    });
    return c.json(options);
  });

  app.post("/login/verify", async (c) => {
    const { userId, response } = await c.req.json<{
      userId: string;
      response: AuthenticationResponse;
    }>();
    await finishAuthentication(
      config.store,
      config.rp,
      { id: userId, name: userId },
      response,
    );
    const payload = await resolveIdentity(userId);
    const cookie = await config.auth.issueSession(payload, maxAge);
    c.header("set-cookie", cookie);
    return c.json({ ok: true });
  });

  app.post("/logout", (c) => {
    c.header("set-cookie", config.auth.clearSession());
    return c.json({ ok: true });
  });

  return app;
}
