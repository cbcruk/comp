import {
  and,
  eq,
  getTableColumns,
  inArray,
  is,
  like,
  or,
  type Column,
  type SQL,
  type Table,
} from "drizzle-orm";
import {
  SQLiteTable,
  getTableConfig,
  type SQLiteColumn,
} from "drizzle-orm/sqlite-core";
import type { Collection } from "../collection/define-collection.types.js";
import type { ResolvedSearch, SearchLookup } from "../search/search.types.js";
import { splitSearchTerms } from "../search/resolve-search.js";
import type { SqliteDb } from "./build-list-query.js";

/** The table a foreign key points at, and the columns on it. */
interface RelationTarget {
  table: SQLiteTable;
  columns: Record<string, Column>;
}

/**
 * Find the table a field's foreign key references.
 *
 * The Drizzle table object is reachable from the key itself, so a traversal
 * needs nothing but the collection it starts from — no registry, and no
 * requirement that the target even be a registered collection.
 */
function relationTarget(model: Table, field: string): RelationTarget | null {
  if (!is(model, SQLiteTable)) return null;

  const columns = getTableColumns(model) as Record<string, Column>;
  const column = columns[field];
  if (!column) return null;

  for (const foreignKey of getTableConfig(model).foreignKeys) {
    const reference = foreignKey.reference();
    if (reference.columns.length !== 1) continue;
    if (reference.columns[0]?.name !== column.name) continue;
    const table = reference.foreignTable as SQLiteTable;
    return { table, columns: getTableColumns(table) as Record<string, Column> };
  }
  return null;
}

function match(column: Column, lookup: SearchLookup, term: string): SQL {
  switch (lookup) {
    case "startswith":
      return like(column, `${term}%`);
    case "exact":
      return eq(column, term);
    default:
      return like(column, `%${term}%`);
  }
}

/**
 * One search field's condition for one term. A traversal becomes a subquery
 * rather than a join: the row set stays one-per-record, so the list needs no
 * `DISTINCT` and its count stays honest — which is the thing a join through a
 * to-many relation costs you.
 */
function condition(
  db: SqliteDb,
  collection: Collection,
  spec: ResolvedSearch,
  term: string,
  columns: Record<string, Column>,
): SQL | undefined {
  const column = columns[spec.field];
  if (!column) return undefined;

  if (!spec.through) return match(column, spec.lookup, term);

  const target = relationTarget(collection.model, spec.field);
  const far = target?.columns[spec.through.field];
  if (!target || !far) return undefined;

  const keyColumn = Object.values(target.columns).find(
    (candidate) => candidate.primary,
  );
  if (!keyColumn) return undefined;

  return inArray(
    column,
    db
      // The columns come off an SQLiteTable; the generic `Column` type is
      // just how they are carried around here.
      .select({ value: keyColumn as unknown as SQLiteColumn })
      .from(target.table)
      .where(match(far, spec.lookup, term)),
  );
}

/**
 * Build the search condition: every term must match at least one field.
 *
 * Terms are ANDed and fields ORed, so adding a word narrows the result — the
 * behavior a search box implies. Matching the whole query as one substring, as
 * this used to, means a second word usually finds nothing.
 */
export function searchConditions(
  db: SqliteDb,
  collection: Collection,
  query: string,
): SQL[] {
  if (collection.search.length === 0) return [];

  const columns = getTableColumns(collection.model) as Record<string, Column>;
  const conditions: SQL[] = [];

  for (const term of splitSearchTerms(query)) {
    const matches = collection.search
      .map((spec) => condition(db, collection, spec, term, columns))
      .filter((entry): entry is SQL => entry !== undefined);
    if (matches.length === 0) continue;
    conditions.push(matches.length === 1 ? matches[0]! : or(...matches)!);
  }

  return conditions;
}

/** The whole search as one condition, or undefined when it matches nothing. */
export function searchCondition(
  db: SqliteDb,
  collection: Collection,
  query: string,
): SQL | undefined {
  const conditions = searchConditions(db, collection, query);
  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}
