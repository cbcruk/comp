import {
  and,
  eq,
  getTableColumns,
  inArray,
  notInArray,
  type Column,
  type SQL,
  type Table,
} from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Collection } from "../collection/define-collection.types.js";
import type { FilterValue } from "../filters/filter.types.js";
import { coerceFilterOperand } from "../filters/filter-value.js";
import type { ManyToManyMeta } from "../m2m/m2m.types.js";
import type { SqliteDb } from "./build-list-query.js";

function columnsOf(table: Table): Record<string, Column> {
  return getTableColumns(table) as Record<string, Column>;
}

/** Drizzle's select fields are dialect-typed; the query layer is SQLite-only. */
function selectable(column: Column): SQLiteColumn {
  return column as unknown as SQLiteColumn;
}

/** A join-table column, by the field name the resolution recorded. */
export function joinColumn(meta: ManyToManyMeta, field: string): Column {
  const column = columnsOf(meta.through)[field];
  if (!column) {
    throw new Error(
      `Join table for "${meta.name}" has no column "${field}"`,
    );
  }
  return column;
}

/** Which records on the far side this row is linked to. */
export function buildLinkedIdsQuery(
  db: SqliteDb,
  meta: ManyToManyMeta,
  parentId: unknown,
) {
  const target = joinColumn(meta, meta.targetField);
  return db
    .select({ value: selectable(target) })
    .from(meta.through as unknown as SQLiteTable)
    .where(eq(joinColumn(meta, meta.field), parentId));
}

/**
 * Link rows, one statement for the whole set.
 *
 * The parent key is filled in here rather than taken from the caller, the same
 * rule an inline follows: this edits one record's links, so pointing a link at
 * a different record is not one of the operations on offer.
 */
export function buildLinkInsert(
  db: SqliteDb,
  meta: ManyToManyMeta,
  parentId: unknown,
  targetIds: readonly unknown[],
) {
  // Keyed by the table's field names, not its column names: Drizzle maps
  // values by property, and a column name that is not one silently inserts
  // nothing for that column.
  return db.insert(meta.through as unknown as SQLiteTable).values(
    targetIds.map((id) => ({
      [meta.field]: parentId,
      [meta.targetField]: id,
    })) as SQLiteTable["$inferInsert"][],
  );
}

/**
 * Unlink, scoped to the parent in SQL. Without that clause an id from another
 * record's set would take its links with it.
 */
export function buildLinkDelete(
  db: SqliteDb,
  meta: ManyToManyMeta,
  parentId: unknown,
  targetIds: readonly unknown[],
) {
  return db
    .delete(meta.through as unknown as SQLiteTable)
    .where(
      and(
        eq(joinColumn(meta, meta.field), parentId),
        inArray(joinColumn(meta, meta.targetField), targetIds as unknown[]),
      ),
    );
}

/** The far-side rows behind a set of ids — how a write knows they exist. */
export function buildTargetExistsQuery(
  db: SqliteDb,
  target: Collection,
  targetKey: string,
  ids: readonly unknown[],
) {
  const column = columnsOf(target.model)[targetKey];
  if (!column) {
    throw new Error(`"${target.slug}" has no column "${targetKey}"`);
  }
  return db
    .select({ value: selectable(column) })
    .from(target.model as unknown as SQLiteTable)
    .where(inArray(column, ids as unknown[]));
}

/**
 * Narrow a list to the records linked to something — Django's related filter
 * over a many-to-many.
 *
 * A subquery rather than a join, for the reason the search traversal is one: a
 * join multiplies a row by its links, and a list that shows a record twice
 * because it has two matching tags has stopped being a list of records. No
 * `DISTINCT`, and the count still matches the rows.
 */
export function manyToManyCondition(
  collection: Collection,
  meta: ManyToManyMeta,
  value: FilterValue,
  db: SqliteDb,
): SQL | undefined {
  const parentColumn = columnsOf(collection.model)[meta.parentKey];
  if (!parentColumn) return undefined;

  const linkParent = joinColumn(meta, meta.field);
  const linkTarget = joinColumn(meta, meta.targetField);
  const linked = (where?: SQL) => {
    const query = db
      .select({ value: selectable(linkParent) })
      .from(meta.through as unknown as SQLiteTable)
      .$dynamic();
    return where ? query.where(where) : query;
  };

  // The operand is compared against the join table's own column, so it is
  // coerced to that column's type — a query string only ever carries text, and
  // an integer key compared against "3" matches nothing.
  const operand = (raw: unknown): unknown =>
    coerceFilterOperand(
      {
        name: meta.targetField,
        columnName: linkTarget.name,
        dataType: linkTarget.dataType,
        columnType: linkTarget.columnType,
        notNull: linkTarget.notNull,
        hasDefault: linkTarget.hasDefault,
        primaryKey: false,
      },
      raw,
    );

  switch (value.op) {
    case "exact":
      return inArray(parentColumn, linked(eq(linkTarget, operand(value.value))));
    case "in": {
      const operands = value.values
        .map(operand)
        .filter((entry) => entry !== null);
      if (operands.length === 0) return undefined;
      return inArray(parentColumn, linked(inArray(linkTarget, operands)));
    }
    case "isnull":
      // Empty reads as "has no links at all" here: a link row either exists or
      // it does not, so there is no null to test.
      return value.value
        ? notInArray(parentColumn, linked())
        : inArray(parentColumn, linked());
    default:
      return undefined;
  }
}
