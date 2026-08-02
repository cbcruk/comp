import { integer, index, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * The canonical history table, for apps that want to keep entries in the same
 * database as their records. Exported so a schema can re-export it and
 * `drizzle-kit` generates the migration — the same shape `@comp/auth` uses for
 * its passkey tables.
 *
 * `fields` is stored as a JSON array of column names rather than a related
 * table: an entry is written once and read whole, and a join per row buys
 * nothing at the edge.
 */
export const historyEntries = sqliteTable(
  "comp_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    collection: text("collection").notNull(),
    recordId: text("record_id").notNull(),
    action: text("action", { enum: ["create", "update", "delete"] }).notNull(),
    label: text("label").notNull(),
    fields: text("fields").notNull().default("[]"),
    actor: text("actor"),
    at: integer("at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    // The per-record history view reads by (collection, record) newest first.
    index("comp_history_record_idx").on(table.collection, table.recordId),
    index("comp_history_at_idx").on(table.at),
  ],
);

/** Decode the stored field list, tolerating anything that is not a JSON array. */
export function parseFields(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function serializeFields(fields: readonly string[]): string {
  return JSON.stringify(fields);
}
