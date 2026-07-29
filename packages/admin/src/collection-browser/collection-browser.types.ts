import type { ComponentPropsWithoutRef } from "react";
import type {
  CollectionSummary,
  CompClient,
} from "../client/create-client.types.js";
import type { CollectionListProps } from "../collection-list/collection-list.types.js";
import type { ReferenceConfig } from "./reference-labels.js";

export interface CollectionBrowserProps extends ComponentPropsWithoutRef<"div"> {
  client: CompClient;
  collection: CollectionSummary;
  /** Initial page size; falls back to the server's default when omitted. */
  pageSize?: number;
  /** Forwarded to the underlying table for custom cell rendering. */
  renderCell?: CollectionListProps["renderCell"];
  /** Enable click-to-edit cells that PATCH on commit (ignored if renderCell is set). */
  editable?: boolean;
  /** Notified on action success/failure; when set, action errors route here. */
  onNotify?: (kind: "success" | "error", message: string) => void;
  /**
   * Override how FK columns resolve to labels, keyed by column. Omit it and
   * the collection's introspected relations are used.
   */
  references?: Record<string, ReferenceConfig>;
}
