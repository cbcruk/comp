import type { SqliteDb } from "@comp/core";
import { eq } from "drizzle-orm";
import {
  parseTransports,
  passkeyChallenges,
  passkeyCredentials,
  serializeTransports,
} from "./passkey-schema.js";
import type {
  PasskeyStore,
  StoredCredential,
} from "./passkey-store.types.js";

/**
 * A {@link PasskeyStore} backed by Drizzle over SQLite/D1, using the canonical
 * passkey tables. Persistent and isolate-shared — suitable for Workers, unlike
 * the in-memory store.
 */
export function createDrizzlePasskeyStore(db: SqliteDb): PasskeyStore {
  return {
    async saveChallenge(userId, challenge) {
      await db
        .insert(passkeyChallenges)
        .values({ userId, challenge })
        .onConflictDoUpdate({
          target: passkeyChallenges.userId,
          set: { challenge },
        });
    },
    async takeChallenge(userId) {
      const rows = await db
        .select({ challenge: passkeyChallenges.challenge })
        .from(passkeyChallenges)
        .where(eq(passkeyChallenges.userId, userId))
        .limit(1);
      await db
        .delete(passkeyChallenges)
        .where(eq(passkeyChallenges.userId, userId));
      return rows[0]?.challenge ?? null;
    },
    async saveCredential(credential) {
      await db.insert(passkeyCredentials).values({
        id: credential.id,
        userId: credential.userId,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: serializeTransports(credential.transports),
      });
    },
    async getCredentialsByUser(userId) {
      const rows = await db
        .select()
        .from(passkeyCredentials)
        .where(eq(passkeyCredentials.userId, userId));
      return rows.map(toStoredCredential);
    },
    async getCredentialById(id) {
      const rows = await db
        .select()
        .from(passkeyCredentials)
        .where(eq(passkeyCredentials.id, id))
        .limit(1);
      return rows[0] ? toStoredCredential(rows[0]) : null;
    },
    async updateCounter(id, counter) {
      await db
        .update(passkeyCredentials)
        .set({ counter })
        .where(eq(passkeyCredentials.id, id));
    },
  };
}

function toStoredCredential(
  row: typeof passkeyCredentials.$inferSelect,
): StoredCredential {
  return {
    id: row.id,
    userId: row.userId,
    publicKey: row.publicKey,
    counter: row.counter,
    transports: parseTransports(row.transports),
  };
}
