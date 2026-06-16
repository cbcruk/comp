import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  like,
  or,
  sql,
  type Column,
  type SQL,
  type Table,
} from "drizzle-orm";
import type { BaseSQLiteDatabase, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Collection } from "../collection/define-collection.types.js";
import type { ListParams } from "./list-query.types.js";

/** Async SQLite database (Cloudflare D1, sqlite-proxy, etc.). */
export type SqliteDb = BaseSQLiteDatabase<"async", unknown>;

function columnsOf(model: Table): Record<string, Column> {
  return getTableColumns(model) as Record<string, Column>;
}

function buildWhere(
  collection: Collection,
  params: ListParams,
): SQL | undefined {
  const columns = columnsOf(collection.model);
  const conditions: SQL[] = [];

  if (params.filters) {
    for (const [field, value] of Object.entries(params.filters)) {
      if (value === undefined) continue;
      const column = columns[field];
      if (column) conditions.push(eq(column, value));
    }
  }

  const term = params.search?.trim();
  if (term && collection.search.length > 0) {
    const pattern = `%${term}%`;
    const matches = collection.search
      .map((field) => columns[field])
      .filter((column): column is Column => Boolean(column))
      .map((column) => like(column, pattern));
    const searchExpr: SQL | undefined =
      matches.length > 1 ? or(...matches) : matches[0];
    if (searchExpr) conditions.push(searchExpr);
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
  const where = buildWhere(collection, params);
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

/** Companion count query for pagination totals, sharing the same filters. */
export function buildCountQuery(
  db: SqliteDb,
  collection: Collection,
  params: Pick<ListParams, "search" | "filters"> = {},
) {
  const where = buildWhere(collection, params);
  const query = db
    .select({ count: sql<number>`count(*)` })
    .from(collection.model as unknown as SQLiteTable)
    .$dynamic();
  return where ? query.where(where) : query;
}
