import { and, getTableColumns, type Column, type SQL, type Table } from "drizzle-orm";
import type { RecordScope } from "../auth/auth-adapter.types.js";
import type { Collection } from "../collection/define-collection.types.js";
import type { FilterValue } from "../filters/filter.types.js";
import { filterCondition } from "./build-filter-where.js";

const OPS = new Set(["exact", "in", "isnull", "range", "preset"]);

function asFilterValue(value: unknown): FilterValue {
  if (
    value !== null &&
    typeof value === "object" &&
    "op" in value &&
    OPS.has(String((value as { op: unknown }).op))
  ) {
    return value as FilterValue;
  }
  return { op: "exact", value };
}

/**
 * Turn an identity's scope into SQL.
 *
 * Two things separate this from the filter path it borrows its vocabulary
 * from. A filter is only honored for columns the collection declared
 * filterable — the declaration is the allow-list — while a scope is the
 * server's own rule and reaches any column. And a filter naming a column the
 * table does not have is dropped, which for a scope would mean quietly
 * returning every row; so that throws instead. A narrowing that fails has to
 * fail closed and loudly.
 */
export function scopeConditions(
  collection: Collection,
  scope: RecordScope,
  now: Date = new Date(),
): SQL[] {
  const columns = getTableColumns(collection.model as Table) as Record<
    string,
    Column
  >;
  const conditions: SQL[] = [];

  for (const [name, raw] of Object.entries(scope)) {
    const column = columns[name];
    const field = collection.fields[name];
    if (!column || !field) {
      throw new Error(
        `Scope on "${collection.slug}" names "${name}", which is not a column ` +
          `— a scope that cannot be applied would silently show every row`,
      );
    }
    const condition = filterCondition(column, field, asFilterValue(raw), now);
    if (condition) conditions.push(condition);
  }

  return conditions;
}

/** The scope as one condition, or undefined when there is nothing to narrow. */
export function scopeWhere(
  collection: Collection,
  scope: RecordScope | undefined,
  now?: Date,
): SQL | undefined {
  if (!scope) return undefined;
  const conditions = scopeConditions(collection, scope, now);
  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}
