import { eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Collection } from "../collection/define-collection.types.js";
import type { SqliteDb } from "../query/build-list-query.js";
import { primaryKeyColumn } from "../query/primary-key.js";

type InsertValues = SQLiteTable["$inferInsert"];

function asTable(collection: Collection): SQLiteTable {
  return collection.model as unknown as SQLiteTable;
}

/**
 * Insert a row and return it. Values are expected to be pre-validated with
 * `validateInsert`; the query layer trusts the shape and only builds SQL.
 */
export function buildInsertQuery(
  db: SqliteDb,
  collection: Collection,
  values: Record<string, unknown>,
) {
  return db
    .insert(asTable(collection))
    .values(values as InsertValues)
    .returning();
}

/** Update the row identified by `id` and return the new state. */
export function buildUpdateQuery(
  db: SqliteDb,
  collection: Collection,
  id: unknown,
  values: Record<string, unknown>,
) {
  const pk = primaryKeyColumn(collection);
  return db
    .update(asTable(collection))
    .set(values)
    .where(eq(pk, id))
    .returning();
}

/** Delete the row identified by `id` and return what was removed. */
export function buildDeleteQuery(
  db: SqliteDb,
  collection: Collection,
  id: unknown,
) {
  const pk = primaryKeyColumn(collection);
  return db.delete(asTable(collection)).where(eq(pk, id)).returning();
}
