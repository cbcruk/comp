import { and, eq, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { RecordScope } from "../auth/auth-adapter.types.js";
import type { Collection } from "../collection/define-collection.types.js";
import type { SqliteDb } from "../query/build-list-query.js";
import { primaryKeyColumn } from "../query/primary-key.js";
import { scopeWhere } from "../query/build-scope-where.js";

type InsertValues = SQLiteTable["$inferInsert"];

function asTable(collection: Collection): SQLiteTable {
  return collection.model as unknown as SQLiteTable;
}

/**
 * The row this write is allowed to reach: its id, and the caller's scope.
 *
 * The scope goes into the statement rather than being checked before it. A
 * read that says "yes, you may" and a write that trusts it are two moments a
 * row can change between; one statement has no gap.
 */
function target(
  collection: Collection,
  id: unknown,
  scope: RecordScope | undefined,
): SQL {
  const pk = primaryKeyColumn(collection);
  const visible = scopeWhere(collection, scope);
  return visible ? and(eq(pk, id), visible)! : eq(pk, id);
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
  scope?: RecordScope,
) {
  return db
    .update(asTable(collection))
    .set(values)
    .where(target(collection, id, scope))
    .returning();
}

/** Delete the row identified by `id` and return what was removed. */
export function buildDeleteQuery(
  db: SqliteDb,
  collection: Collection,
  id: unknown,
  scope?: RecordScope,
) {
  return db
    .delete(asTable(collection))
    .where(target(collection, id, scope))
    .returning();
}
