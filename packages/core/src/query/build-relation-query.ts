import { eq, getTableColumns, sql, type Column } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Collection } from "../collection/define-collection.types.js";
import type { SqliteDb } from "./build-list-query.js";

/** The column backing a field on a collection, or throw. */
export function columnFor(collection: Collection, field: string): Column {
  const columns = getTableColumns(collection.model) as Record<string, Column>;
  const column = columns[field];
  if (!column) {
    throw new Error(`Field "${field}" not found on "${collection.slug}"`);
  }
  return column;
}

/**
 * How many rows of a collection point at a given value through one of its
 * foreign keys. This is what makes a delete confirmation honest — it says how
 * much else the delete reaches instead of asking the user to guess.
 */
export function buildReferenceCountQuery(
  db: SqliteDb,
  collection: Collection,
  field: string,
  value: unknown,
) {
  return db
    .select({ count: sql<number>`count(*)` })
    .from(collection.model as unknown as SQLiteTable)
    .where(eq(columnFor(collection, field), value));
}
