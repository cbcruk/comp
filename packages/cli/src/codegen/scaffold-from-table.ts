import {
  inferFilterKind,
  introspectTable,
  type Table,
  type TableIntrospection,
} from "@comp/core";
import { scaffoldCollection } from "./scaffold-collection.js";

const MAX_LIST_DISPLAY = 6;

export interface ScaffoldDefaults {
  listDisplay: string[];
  filters: string[];
  search: string[];
}

/**
 * Pick sensible collection defaults from a table's introspected fields: the
 * first few columns for the list, and free-text string columns for search.
 *
 * A column is offered as a filter when its type implies a filter worth having
 * — an enum, a boolean, a date, a foreign key. A plain text column is left out:
 * its filter would be a bare text box, which the search box already covers.
 */
export function deriveScaffoldDefaults(
  introspection: TableIntrospection,
): ScaffoldDefaults {
  const fields = Object.values(introspection.fields);
  return {
    listDisplay: fields.slice(0, MAX_LIST_DISPLAY).map((field) => field.name),
    filters: fields
      .filter((field) => !field.primaryKey && inferFilterKind(field) !== "exact")
      .map((field) => field.name),
    search: fields
      .filter((field) => field.dataType === "string" && !field.enumValues)
      .map((field) => field.name),
  };
}

export interface ScaffoldFromTableOptions {
  name: string;
  table: string;
  module: string;
}

/** Introspect a live Drizzle table and generate a collection module from it. */
export function scaffoldFromTable(
  table: Table,
  options: ScaffoldFromTableOptions,
): string {
  const defaults = deriveScaffoldDefaults(introspectTable(table));
  return scaffoldCollection({
    name: options.name,
    table: options.table,
    module: options.module,
    ...defaults,
  });
}
