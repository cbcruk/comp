import type { Collection } from "../collection/define-collection.types.js";

/**
 * A child collection edited alongside its parent — Django's inline. The string
 * form names the child collection and lets the foreign key be inferred; the
 * object form is for when the child points at the parent more than once, or
 * when rows must not be removable.
 */
export type InlineConfig =
  | string
  | {
      /** Slug of the child collection. */
      collection: string;
      /** FK field on the child; required only when the key is ambiguous. */
      field?: string;
      /** Whether rows may be deleted from the parent's editor. Default true. */
      canDelete?: boolean;
    };

/**
 * An inline resolved against the relation graph: which child, over which key,
 * pointing at which parent field. Resolution happens once over the registry,
 * so a request never has to work out what an inline means.
 */
export interface InlineSpec {
  /** The child collection itself. */
  collection: Collection;
  /** FK field on the child holding the parent's key. */
  field: string;
  /** Field on the parent the key points at. */
  targetField: string;
  canDelete: boolean;
}

/** The serializable view of an inline, for clients and tool schemas. */
export interface InlineSummary {
  collection: string;
  field: string;
  targetField: string;
  canDelete: boolean;
}

/**
 * Changes to one inline's rows. Explicit operations rather than a whole
 * submitted row set: the server never has to diff, and each operation can be
 * checked against the child's manifest and the caller's permissions before
 * anything runs.
 */
export interface InlineWrite {
  create?: Record<string, unknown>[];
  update?: { id: unknown; values: Record<string, unknown> }[];
  delete?: unknown[];
}

/** Inline changes for a whole parent write, keyed by child collection slug. */
export type InlineWritePayload = Record<string, InlineWrite>;

/** Validated, parent-scoped rows ready for the query layer. */
export interface PreparedInlineWrite {
  create: Record<string, unknown>[];
  update: { id: unknown; values: Record<string, unknown> }[];
  delete: unknown[];
}

export interface InlineWriteResult {
  collection: string;
  created: Record<string, unknown>[];
  updated: Record<string, unknown>[];
  deleted: Record<string, unknown>[];
}
