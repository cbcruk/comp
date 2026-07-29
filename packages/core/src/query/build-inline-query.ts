import { and, asc, desc, eq, getTableColumns, type Column, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Collection } from "../collection/define-collection.types.js";
import type { InlineSpec } from "../inline/inline.types.js";
import type { SqliteDb } from "./build-list-query.js";
import { primaryKeyColumn } from "./primary-key.js";

function asTable(collection: Collection): SQLiteTable {
  return collection.model as unknown as SQLiteTable;
}

/** The child column holding the parent's key, or throw. */
function foreignKeyColumn(spec: InlineSpec): Column {
  const columns = getTableColumns(spec.collection.model) as Record<string, Column>;
  const column = columns[spec.field];
  if (!column) {
    throw new Error(
      `Inline key "${spec.field}" not found on "${spec.collection.slug}"`,
    );
  }
  return column;
}

/**
 * Read a parent's child rows, in the child's declared order. Bounded by the
 * child's page size — an inline editor shows a parent's rows, not an unbounded
 * table.
 */
export function buildInlineListQuery(
  db: SqliteDb,
  spec: InlineSpec,
  parentId: unknown,
) {
  const child = spec.collection;
  const columns = getTableColumns(child.model) as Record<string, Column>;
  const orderBy: SQL[] = [];
  for (const ordering of child.ordering) {
    const column = columns[ordering.field];
    if (!column) continue;
    orderBy.push(ordering.direction === "desc" ? desc(column) : asc(column));
  }

  let query = db
    .select()
    .from(asTable(child))
    .where(eq(foreignKeyColumn(spec), parentId))
    .$dynamic();
  if (orderBy.length > 0) query = query.orderBy(...orderBy);
  return query.limit(child.pageSize);
}

/**
 * Update a child row *of this parent*. The parent key is part of the where
 * clause, not just the lookup: an inline write may only touch rows that belong
 * to the record being edited, however the caller addresses them.
 */
export function buildInlineUpdateQuery(
  db: SqliteDb,
  spec: InlineSpec,
  parentId: unknown,
  id: unknown,
  values: Record<string, unknown>,
) {
  const pk = primaryKeyColumn(spec.collection);
  return db
    .update(asTable(spec.collection))
    .set(values)
    .where(and(eq(pk, id), eq(foreignKeyColumn(spec), parentId)))
    .returning();
}

/** Delete a child row of this parent, scoped the same way. */
export function buildInlineDeleteQuery(
  db: SqliteDb,
  spec: InlineSpec,
  parentId: unknown,
  id: unknown,
) {
  const pk = primaryKeyColumn(spec.collection);
  return db
    .delete(asTable(spec.collection))
    .where(and(eq(pk, id), eq(foreignKeyColumn(spec), parentId)))
    .returning();
}
