import type { Table } from "drizzle-orm";
import type {
  FieldMap,
  TableRelation,
} from "../introspection/introspect-table.types.js";

/** Field names of a Drizzle table, checked at the type level. */
export type ColumnKey<TTable extends Table> = keyof TTable["$inferSelect"] &
  string;

export type SortDirection = "asc" | "desc";

/** Ordering spec while authoring — the field is checked against the table. */
export interface OrderingSpec<TTable extends Table> {
  field: ColumnKey<TTable>;
  direction?: SortDirection;
}

/** Ordering spec on the resolved, type-erased collection. */
export interface FieldOrdering {
  field: string;
  direction?: SortDirection;
}

/**
 * What a collection lets callers do. Kept static and serializable so the same
 * declaration drives the UI, CLI, and (later) MCP, and so it can become an
 * enforced capability grant once actions run sandboxed.
 */
export type CollectionOperation =
  | "list"
  | "read"
  | "create"
  | "update"
  | "delete";

export interface CollectionManifest {
  collection: string;
  operations: CollectionOperation[];
}

export interface CollectionConfig<TTable extends Table> {
  /** Drizzle table this collection manages. */
  model: TTable;
  /** URL-safe identifier; defaults to the table name. */
  slug?: string;
  /** Columns shown as columns in the list view. */
  listDisplay: ColumnKey<TTable>[];
  /** Columns offered as equality filters. */
  filters?: ColumnKey<TTable>[];
  /** Columns matched by the free-text search box. */
  search?: ColumnKey<TTable>[];
  /**
   * Field that stands in for a whole record when another collection references
   * it. Defaults to the first textual `listDisplay` column; set it when that
   * guess reads badly.
   */
  labelField?: ColumnKey<TTable>;
  /** Default ordering applied when the request specifies none. */
  ordering?: OrderingSpec<TTable>[];
  /** Default page size for the list view. */
  pageSize?: number;
  /** Operations this collection exposes; defaults to full CRUD. */
  operations?: CollectionOperation[];
}

/**
 * A normalized, serializable collection: the author's config with defaults
 * filled in and the table's introspected fields attached. Deliberately
 * non-generic — column keys are checked at authoring time in
 * {@link CollectionConfig}, and the resolved value is a plain record so it can
 * be stored in arrays, serialized, and consumed uniformly by `@comp/admin`,
 * `@comp/server`, and `@comp/cli`.
 */
export interface Collection {
  slug: string;
  model: Table;
  fields: FieldMap;
  primaryKey: string | null;
  /** Foreign keys declared on the table, composite ones included. */
  relations: TableRelation[];
  /** Field representing a record when referenced from elsewhere. */
  labelField: string | null;
  listDisplay: string[];
  filters: string[];
  search: string[];
  ordering: FieldOrdering[];
  pageSize: number;
  manifest: CollectionManifest;
}
