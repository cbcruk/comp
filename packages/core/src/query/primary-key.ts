import { getTableColumns, type Column } from "drizzle-orm";
import type { Collection } from "../collection/define-collection.types.js";

/** Resolve the Drizzle column backing a collection's primary key, or throw. */
export function primaryKeyColumn(collection: Collection): Column {
  if (collection.primaryKey === null) {
    throw new Error(`Collection "${collection.slug}" has no primary key`);
  }
  const columns = getTableColumns(collection.model) as Record<string, Column>;
  const column = columns[collection.primaryKey];
  if (!column) {
    throw new Error(
      `Primary key "${collection.primaryKey}" not found on "${collection.slug}"`,
    );
  }
  return column;
}
