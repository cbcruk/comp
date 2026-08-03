import {
  asc,
  desc,
  gte,
  lt,
  sql,
  type Column,
  type SQL,
} from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Collection } from "../collection/define-collection.types.js";
import type { HierarchyBucket } from "../hierarchy/date-path.js";
import { buildListWhere, type SqliteDb } from "./build-list-query.js";
import { columnFor } from "./build-relation-query.js";
import type { ListParams } from "./list-query.types.js";

function asTable(collection: Collection): SQLiteTable {
  return collection.model as unknown as SQLiteTable;
}

/** Column name a bucket's count comes back under. */
export function bucketKey(index: number): string {
  return `b${String(index)}`;
}

/**
 * The earliest (or latest) row by the hierarchy column, under the list's own
 * conditions.
 *
 * A row rather than an aggregate on purpose: `min()` returns whatever the
 * column stores, and a Drizzle timestamp column reports the same `columnType`
 * whether it holds seconds or milliseconds — so the raw number is not safely
 * readable. Selecting the row lets the column's own mapper decode it, which is
 * the only storage-agnostic way to learn the span.
 */
export function buildDateBoundQuery(
  db: SqliteDb,
  collection: Collection,
  params: ListParams,
  column: Column,
  direction: "min" | "max",
) {
  const where = buildListWhere(db, collection, params);
  let query = db.select().from(asTable(collection)).$dynamic();
  if (where) query = query.where(where);
  return query
    .orderBy(direction === "min" ? asc(column) : desc(column))
    .limit(1);
}

/**
 * Count every bucket in one round trip.
 *
 * The boundaries are computed in JS and compared with the same `gte`/`lt` the
 * date filter uses, so each bound goes through the column's mapper and the
 * query never has to know how a timestamp is stored. One summed CASE per
 * bucket beats one query per bucket — a day level would otherwise be
 * thirty-one round trips.
 *
 * Every branch is aliased because the branches are otherwise the same
 * expression text: drivers that hand back rows as objects keyed by column name
 * (D1 among them) collapse the duplicates, and all but one bucket would read
 * as empty.
 */
export function buildBucketCountQuery(
  db: SqliteDb,
  collection: Collection,
  params: ListParams,
  column: Column,
  buckets: readonly HierarchyBucket[],
) {
  const counts: Record<string, SQL.Aliased<number>> = {};
  buckets.forEach((bucket, index) => {
    const name = bucketKey(index);
    counts[name] = sql<number>`sum(case when ${gte(column, bucket.from)} and ${lt(
      column,
      bucket.to,
    )} then 1 else 0 end)`.as(name);
  });

  const where = buildListWhere(db, collection, params);
  let query = db.select(counts).from(asTable(collection)).$dynamic();
  if (where) query = query.where(where);
  return query;
}

/** The hierarchy column, or throw if the declaration named something else. */
export function hierarchyColumn(collection: Collection): Column {
  if (!collection.dateHierarchy) {
    throw new Error(`Collection "${collection.slug}" declares no date hierarchy`);
  }
  return columnFor(collection, collection.dateHierarchy);
}
