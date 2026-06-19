import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type Row = Record<string, unknown>;

/** Optional row-selection config; when present, a checkbox column is rendered. */
export interface RowSelection {
  getRowId: (row: Row) => string | null;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll?: () => void;
  allSelected?: boolean;
}

/** Optional sort config; when present, headers are clickable sort toggles. */
export interface ColumnSort {
  field: string | null;
  direction: "asc" | "desc" | null;
  onSort: (column: string) => void;
}

export interface CollectionListProps extends ComponentPropsWithoutRef<"table"> {
  /** Column keys to render, in order — mirrors a collection's `listDisplay`. */
  columns: string[];
  rows: Row[];
  /** Override how a single cell renders; defaults to `String(value)`. */
  renderCell?: (args: { column: string; value: unknown; row: Row }) => ReactNode;
  /** Override how a header cell renders; defaults to the column key. */
  renderHeader?: (column: string) => ReactNode;
  /** Shown when there are no rows. */
  renderEmpty?: () => ReactNode;
  /** Enables a leading checkbox column for bulk selection. */
  selection?: RowSelection;
  /** Enables clickable, sortable column headers. */
  sort?: ColumnSort;
}
