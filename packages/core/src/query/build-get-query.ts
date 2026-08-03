import { and, eq, inArray } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { RecordScope } from "../auth/auth-adapter.types.js";
import type { Collection } from "../collection/define-collection.types.js";
import type { SqliteDb } from "./build-list-query.js";
import { primaryKeyColumn } from "./primary-key.js";
import { scopeWhere } from "./build-scope-where.js";

/**
 * Resolve a single row by its primary key. Returns a Drizzle query limited to
 * one result; the caller decides how to surface "not found".
 *
 * A scope narrows this the same way it narrows the list, which is what makes
 * an out-of-scope record indistinguishable from one that does not exist — the
 * caller learns nothing by guessing ids.
 */
export function buildGetByIdQuery(
  db: SqliteDb,
  collection: Collection,
  id: unknown,
  scope?: RecordScope,
) {
  const pk = primaryKeyColumn(collection);
  const visible = scopeWhere(collection, scope);
  return db
    .select()
    .from(collection.model as unknown as SQLiteTable)
    .where(visible ? and(eq(pk, id), visible) : eq(pk, id))
    .limit(1);
}

/**
 * The rows behind a list of ids, narrowed to what the caller may see.
 *
 * Bulk operations name their targets by id, and an id is not a permission: an
 * action must be handed the rows that survive the scope, not the ones that
 * were asked for. Returning the rows rather than the ids also lets a
 * per-record rule see what it is deciding about.
 */
export function buildRecordsByIdsQuery(
  db: SqliteDb,
  collection: Collection,
  ids: readonly unknown[],
  scope?: RecordScope,
) {
  const pk = primaryKeyColumn(collection);
  const visible = scopeWhere(collection, scope);
  const where = inArray(pk, ids as unknown[]);
  return db
    .select()
    .from(collection.model as unknown as SQLiteTable)
    .where(visible ? and(where, visible) : where);
}
