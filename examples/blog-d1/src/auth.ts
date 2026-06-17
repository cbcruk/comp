import {
  createDrizzlePasskeyStore,
  createPasskeyAuth,
  createRolePolicy,
  type PasskeyStore,
  type RpInfo,
} from "@comp/auth";
import type { SqliteDb } from "@comp/core";

export interface BlogAuthEnv {
  SESSION_SECRET: string;
  RP_ID: string;
  RP_ORIGIN: string;
}

/**
 * Assemble the passkey auth pieces for the admin API: a cookie-session adapter
 * with a role policy (anonymous can read; writes need a role), a D1-backed
 * credential/challenge store, and the relying-party info for the ceremonies.
 */
export function createBlogAuth(
  env: BlogAuthEnv,
  db: SqliteDb,
): { auth: ReturnType<typeof createPasskeyAuth>; store: PasskeyStore; rp: RpInfo } {
  const auth = createPasskeyAuth({
    secret: env.SESSION_SECRET,
    cookie: { secure: env.RP_ORIGIN.startsWith("https://") },
    authorize: createRolePolicy({
      roles: {
        admin: "all",
        editor: ["list", "read", "create", "update"],
      },
      anonymous: ["list", "read"],
    }),
  });

  return {
    auth,
    store: createDrizzlePasskeyStore(db),
    rp: { rpID: env.RP_ID, rpName: "Comp Blog", origin: env.RP_ORIGIN },
  };
}
