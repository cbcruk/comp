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
 *
 * The policy decides at all three depths Django does — per collection, per
 * identity's rows, and per row.
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
    // Which rows exist for you. A reader who has not signed in sees published
    // posts and nothing else — not a filter they could remove, a narrowing
    // applied to the list, its total, its filter choices, and any row they try
    // to open by id. A draft answers "not found", the same as a post that was
    // never written.
    scope: ({ identity, collection }) =>
      identity || collection.slug !== "posts" ? null : { status: "published" },
    // The same operation, decided again with the row in hand: a published post
    // is locked. Unpublish it first — which is a change to the post, so the
    // rule has to let that one through.
    authorizeRecord: ({ operation, record }) =>
      operation !== "delete" || record.status !== "published",
  });

  return {
    auth,
    store: createDrizzlePasskeyStore(db),
    rp: { rpID: env.RP_ID, rpName: "Comp Blog", origin: env.RP_ORIGIN },
  };
}
