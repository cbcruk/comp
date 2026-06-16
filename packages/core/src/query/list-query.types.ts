import type { FieldOrdering } from "../collection/define-collection.types.js";

export interface ListParams {
  /** 1-based page number. */
  page?: number;
  /** Overrides the collection's default page size. */
  pageSize?: number;
  /** Free-text term matched against the collection's `search` columns. */
  search?: string;
  /** Equality filters, keyed by column name. */
  filters?: Record<string, unknown>;
  /** Overrides the collection's default ordering. */
  ordering?: FieldOrdering[];
}
