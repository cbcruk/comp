import type { Table } from "drizzle-orm";
import type {
  FilterConfig,
  ResolvedFilter,
} from "../filters/filter.types.js";
import type { ResolvedForm } from "../form/form.types.js";
import type { FormConfig } from "../form/resolve-form.js";
import type { InlineConfig } from "../inline/inline.types.js";
import type { ResolvedSearch } from "../search/search.types.js";
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

export interface CollectionConfig<TTable extends Table>
  extends FormConfig<ColumnKey<TTable>> {
  /** Drizzle table this collection manages. */
  model: TTable;
  /** URL-safe identifier; defaults to the table name. */
  slug?: string;
  /** Name for one record; defaults to the slug, humanized and singularized. */
  label?: string;
  /** Name for the collection; defaults to the slug, humanized. */
  labelPlural?: string;
  /** Columns shown as columns in the list view. */
  listDisplay: ColumnKey<TTable>[];
  /**
   * Columns offered as filters. A bare name infers what the column supports —
   * an enum offers its values, a date offers ranges, a foreign key offers the
   * related records — or state the kind with `{ field, kind }`.
   */
  filters?: FilterConfig<ColumnKey<TTable>>[];
  /**
   * What the search box matches. A bare column searches anywhere inside it;
   * `^` anchors to the start and `=` demands the whole value; `field__other`
   * follows the foreign key in `field` and matches `other` across it.
   */
  search?: (ColumnKey<TTable> | string)[];
  /**
   * Field that stands in for a whole record when another collection references
   * it. Defaults to the first textual `listDisplay` column; set it when that
   * guess reads badly.
   */
  labelField?: ColumnKey<TTable>;
  /**
   * Date column to drill down by — a year → month → day trail above the list.
   * Must be a date column; anything else throws at declaration time.
   */
  dateHierarchy?: ColumnKey<TTable>;
  /** Default ordering applied when the request specifies none. */
  ordering?: OrderingSpec<TTable>[];
  /** Default page size for the list view. */
  pageSize?: number;
  /** Operations this collection exposes; defaults to full CRUD. */
  operations?: CollectionOperation[];
  /**
   * Child collections edited alongside a record of this one. The foreign key
   * tying them together is read from the schema; name it only when the child
   * points here more than once.
   */
  inlines?: InlineConfig[];
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
  /** Display name for one record — Django's `verbose_name`. */
  label: string;
  /** Display name for the collection — Django's `verbose_name_plural`. */
  labelPlural: string;
  model: Table;
  fields: FieldMap;
  primaryKey: string | null;
  /** Foreign keys declared on the table, composite ones included. */
  relations: TableRelation[];
  /** Field representing a record when referenced from elsewhere. */
  labelField: string | null;
  listDisplay: string[];
  /** Filters with their kind, choices, and nullability resolved. */
  filters: ResolvedFilter[];
  /** Search fields with their lookup and any relation traversal resolved. */
  search: ResolvedSearch[];
  /** Column the drill-down navigates, or null. */
  dateHierarchy: string | null;
  ordering: FieldOrdering[];
  pageSize: number;
  /** The add/change form as a layout: groups, readonly, prepopulated, radios. */
  form: ResolvedForm;
  /** Declared inlines, as authored; `resolveInlines` binds them to the graph. */
  inlines: InlineConfig[];
  manifest: CollectionManifest;
}
