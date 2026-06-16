import { eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Collection } from "../collection/define-collection.types.js";
import type { SqliteDb } from "./build-list-query.js";
import { primaryKeyColumn } from "./primary-key.js";

/**
 * Resolve a single row by its primary key. Returns a Drizzle query limited to
 * one result; the caller decides how to surface "not found".
 */
export function buildGetByIdQuery(
  db: SqliteDb,
  collection: Collection,
  id: unknown,
) {
  const pk = primaryKeyColumn(collection);
  return db
    .select()
    .from(collection.model as unknown as SQLiteTable)
    .where(eq(pk, id))
    .limit(1);
}
