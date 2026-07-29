import type { FieldOrdering } from "../collection/define-collection.types.js";
import type { FilterMap, FilterValue } from "../filters/filter.types.js";

export interface ListParams {
  /** 1-based page number. */
  page?: number;
  /** Overrides the collection's default page size. */
  pageSize?: number;
  /** Free-text term matched against the collection's `search` columns. */
  search?: string;
  /**
   * Filters keyed by column name. A {@link FilterValue} states its operation;
   * a bare scalar is read as an exact match, so simple callers stay simple.
   */
  filters?: Record<string, FilterValue | unknown>;
  /** Overrides the collection's default ordering. */
  ordering?: FieldOrdering[];
  /**
   * The instant a relative filter (`preset: "today"`) resolves against.
   * Passed in rather than read from the clock so a query is reproducible.
   * Defaults to now.
   */
  now?: Date;
}

export type { FilterMap, FilterValue };
