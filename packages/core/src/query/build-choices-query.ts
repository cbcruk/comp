import { sql, type Column } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Collection } from "../collection/define-collection.types.js";
import type { SqliteDb } from "./build-list-query.js";
import { columnFor } from "./build-relation-query.js";

/**
 * The distinct values a column actually holds, ordered, at most `limit` of
 * them.
 *
 * Deliberately unconditioned: no filters, no search, no drill-down window. A
 * filter whose choices shrink as you use it is a one-way door — pick "paid"
 * and every other status disappears, so switching means clearing first. The
 * date hierarchy counts within the narrowed list because it is navigation;
 * this is the vocabulary of the column, so it comes from the whole table.
 *
 * Selecting the column itself rather than casting it keeps the column's own
 * mapper in play, so a value comes back as the type it was stored as and the
 * option round-trips through the same coercion an exact filter uses.
 */
export function buildDistinctValuesQuery(
  db: SqliteDb,
  collection: Collection,
  field: string,
  limit: number,
) {
  const column: Column = columnFor(collection, field);
  return db
    .selectDistinct({ value: column as unknown as SQLiteColumn })
    .from(collection.model as unknown as SQLiteTable)
    // Nulls last, so the empty rows never occupy a slot the values need: with
    // them first, a column holding a null would report one value fewer than it
    // has and the caller could not tell.
    .orderBy(sql`${column} asc nulls last`)
    // One more than asked for: the extra row is how the answer knows it is a
    // prefix, without a second count query.
    .limit(limit + 1);
}
