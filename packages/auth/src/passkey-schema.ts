import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Single-use registration/authentication challenges, keyed by user id. */
export const passkeyChallenges = sqliteTable("passkey_challenges", {
  userId: text("user_id").primaryKey(),
  challenge: text("challenge").notNull(),
});

/** Registered passkey credentials. `transports` is a JSON-encoded string[]. */
export const passkeyCredentials = sqliteTable("passkey_credentials", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transports: text("transports"),
});

export function serializeTransports(
  transports: string[] | undefined,
): string | null {
  return transports && transports.length > 0 ? JSON.stringify(transports) : null;
}

export function parseTransports(value: unknown): string[] | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : undefined;
  } catch {
    return undefined;
  }
}
