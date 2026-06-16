import { createPasskeyAuth, createRolePolicy } from "@comp/auth";

interface AuthEnv {
  SESSION_SECRET: string;
}

/**
 * Passkey-backed auth adapter for the admin API. Pass `auth` into
 * `createAdminRouter({ collections, actions, auth, getDb })` to gate every
 * operation on the session identity.
 *
 * The adapter itself is stateless (cookie sessions). The passkey *ceremonies*
 * (`createAuthRoutes` from `@comp/auth`) need a `PasskeyStore` — back it with a
 * D1 table for credentials + challenges and mount the routes under `/auth`.
 */
export function createAuth(env: AuthEnv) {
  return createPasskeyAuth({
    secret: env.SESSION_SECRET,
    authorize: createRolePolicy({
      roles: {
        admin: "all",
        editor: ["list", "read", "create", "update"],
      },
      anonymous: ["list", "read"],
    }),
  });
}
