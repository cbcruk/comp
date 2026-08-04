import {
  and,
  asc,
  desc,
  getTableColumns,
  gte,
  lt,
  sql,
  type Column,
  type SQL,
  type Table,
} from "drizzle-orm";
import type { BaseSQLiteDatabase, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Collection } from "../collection/define-collection.types.js";
import type { FilterMap, FilterValue } from "../filters/filter.types.js";
import { datePathRange } from "../hierarchy/date-path.js";
import { filterConditions } from "./build-filter-where.js";
import { scopeConditions } from "./build-scope-where.js";
import { searchConditions } from "./build-search-where.js";
import type { ListParams } from "./list-query.types.js";

/** Async SQLite database (Cloudflare D1, sqlite-proxy, etc.). */
export type SqliteDb = BaseSQLiteDatabase<"async", unknown>;

function columnsOf(model: Table): Record<string, Column> {
  return getTableColumns(model) as Record<string, Column>;
}

const FILTER_OPS = new Set(["exact", "in", "isnull", "range", "preset"]);

/** A caller may pass a bare scalar; read it as the exact match it means. */
function asFilterValue(value: unknown): FilterValue | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value === "object" &&
    "op" in value &&
    FILTER_OPS.has(String((value as { op: unknown }).op))
  ) {
    return value as FilterValue;
  }
  return { op: "exact", value };
}

/**
 * The conditions a list request resolves to: its filters, its search, and the
 * window a date drill-down has narrowed to. Exported so the hierarchy strip
 * counts within the same result set the list shows — offering a month that the
 * current filters have emptied would be a link to nothing.
 */
export function buildListWhere(
  db: SqliteDb,
  collection: Collection,
  params: ListParams,
): SQL | undefined {
  const columns = columnsOf(collection.model);
  const conditions: SQL[] = [];

  // First, because it is not the request's to negotiate: the rows the caller
  // cannot see are not in the result set the filters then narrow.
  if (params.scope) {
    conditions.push(
      ...scopeConditions(collection, params.scope, params.now ?? new Date()),
    );
  }

  if (params.filters) {
    const values: FilterMap = {};
    for (const [field, raw] of Object.entries(params.filters)) {
      const value = asFilterValue(raw);
      if (value) values[field] = value;
    }
    conditions.push(
      ...filterConditions(
        collection,
        columns,
        values,
        params.now ?? new Date(),
        db,
      ),
    );
  }

  const term = params.search?.trim();
  if (term) conditions.push(...searchConditions(db, collection, term));

  // The drill-down narrows the same column the date filter would, through the
  // same half-open range — it is navigation, not a second kind of filter.
  const window = params.datePath ? datePathRange(params.datePath) : null;
  if (window && collection.dateHierarchy) {
    const column = columns[collection.dateHierarchy];
    if (column) {
      conditions.push(and(gte(column, window.from), lt(column, window.to))!);
    }
  }

  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

function buildOrderBy(collection: Collection, params: ListParams): SQL[] {
  const columns = columnsOf(collection.model);
  const specs = params.ordering ?? collection.ordering;
  const order: SQL[] = [];
  for (const spec of specs) {
    const column = columns[spec.field];
    if (!column) continue;
    order.push(spec.direction === "desc" ? desc(column) : asc(column));
  }
  return order;
}

/**
 * Resolve a collection + request params into a Drizzle list query. The query
 * layer — not the UI — owns filtering, search, ordering, and pagination; this
 * function is the single place all three are turned into SQL.
 *
 * Scoped to SQLite/D1 for v0.1. Other dialects get their own builder behind the
 * same signature when needed.
 */
export function buildListQuery(
  db: SqliteDb,
  collection: Collection,
  params: ListParams = {},
) {
  const where = buildListWhere(db, collection, params);
  const orderBy = buildOrderBy(collection, params);
  const pageSize = Math.max(1, params.pageSize ?? collection.pageSize);
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * pageSize;

  let query = db
    .select()
    .from(collection.model as unknown as SQLiteTable)
    .$dynamic();
  if (where) query = query.where(where);
  if (orderBy.length > 0) query = query.orderBy(...orderBy);
  return query.limit(pageSize).offset(offset);
}

/**
 * Companion count query for pagination totals, sharing the same filters — and
 * the same `now`, so a relative filter cannot resolve to one window for the
 * rows and another for the total.
 */
export function buildCountQuery(
  db: SqliteDb,
  collection: Collection,
  params: Pick<
    ListParams,
    "search" | "filters" | "now" | "datePath" | "scope"
  > = {},
) {
  const where = buildListWhere(db, collection, params);
  const query = db
    .select({ count: sql<number>`count(*)` })
    .from(collection.model as unknown as SQLiteTable)
    .$dynamic();
  return where ? query.where(where) : query;
}
