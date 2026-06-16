import type { ReactNode } from "react";

export type Row = Record<string, unknown>;

export interface CollectionListProps {
  /** Column keys to render, in order — mirrors a collection's `listDisplay`. */
  columns: string[];
  rows: Row[];
  /** Override how a single cell renders; defaults to `String(value)`. */
  renderCell?: (args: { column: string; value: unknown; row: Row }) => ReactNode;
  /** Override how a header cell renders; defaults to the column key. */
  renderHeader?: (column: string) => ReactNode;
  /** Shown when there are no rows. */
  renderEmpty?: () => ReactNode;
}
