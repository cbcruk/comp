import type {
  CollectionSummary,
  CompClient,
} from "../client/create-client.types.js";
import type { CollectionListProps } from "../collection-list/collection-list.types.js";

export interface CollectionBrowserProps {
  client: CompClient;
  collection: CollectionSummary;
  /** Initial page size; falls back to the server's default when omitted. */
  pageSize?: number;
  /** Forwarded to the underlying table for custom cell rendering. */
  renderCell?: CollectionListProps["renderCell"];
  /** Enable click-to-edit cells that PATCH on commit (ignored if renderCell is set). */
  editable?: boolean;
}
