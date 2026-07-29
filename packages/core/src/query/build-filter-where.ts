import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  type Column,
  type SQL,
} from "drizzle-orm";
import type { Collection } from "../collection/define-collection.types.js";
import { coerceFilterOperand, dateRangeFor } from "../filters/filter-value.js";
import type { FilterMap, FilterValue } from "../filters/filter.types.js";
import type { FieldMeta } from "../introspection/introspect-table.types.js";

/**
 * Turn one filter value into SQL.
 *
 * Every branch is a lookup Django's filters produce — exact, in, isnull, and a
 * half-open date range — resolved here rather than in the UI, so the HTTP API,
 * MCP, and the admin all narrow a list the same way. Ranges are `[from, to)`:
 * a closed upper bound would make "this month" depend on the column's
 * precision.
 */
export function filterCondition(
  column: Column,
  field: FieldMeta,
  value: FilterValue,
  now: Date,
): SQL | undefined {
  switch (value.op) {
    case "exact": {
      const operand = coerceFilterOperand(field, value.value);
      return operand === null ? isNull(column) : eq(column, operand);
    }
    case "in": {
      const operands = value.values
        .map((entry) => coerceFilterOperand(field, entry))
        .filter((entry) => entry !== null);
      return operands.length > 0 ? inArray(column, operands) : undefined;
    }
    case "isnull":
      return value.value ? isNull(column) : isNotNull(column);
    case "range": {
      const bounds: SQL[] = [];
      const from = coerceFilterOperand(field, value.from);
      const to = coerceFilterOperand(field, value.to);
      if (from !== null) bounds.push(gte(column, from));
      if (to !== null) bounds.push(lt(column, to));
      if (bounds.length === 0) return undefined;
      return bounds.length === 1 ? bounds[0] : and(...bounds);
    }
    case "preset": {
      const { from, to } = dateRangeFor(value.preset, now);
      return and(gte(column, from), lt(column, to));
    }
  }
}

/**
 * Build the conditions for a request's filters. Only columns the collection
 * declared as filterable are honored — the declaration is the allow-list, so a
 * hand-written query string can't reach a column that was never opted in.
 */
export function filterConditions(
  collection: Collection,
  columns: Record<string, Column>,
  filters: FilterMap,
  now: Date,
): SQL[] {
  const declared = new Set(collection.filters.map((filter) => filter.field));
  const conditions: SQL[] = [];

  for (const [name, value] of Object.entries(filters)) {
    if (!declared.has(name)) continue;
    const column = columns[name];
    const field = collection.fields[name];
    if (!column || !field) continue;
    const condition = filterCondition(column, field, value, now);
    if (condition) conditions.push(condition);
  }

  return conditions;
}
