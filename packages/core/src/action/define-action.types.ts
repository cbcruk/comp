import type {
  Collection,
  CollectionOperation,
} from "../collection/define-collection.types.js";
import type { SqliteDb } from "../query/build-list-query.js";

export interface ActionContext {
  db: SqliteDb;
  collection: Collection;
  /** Record ids the action runs against (bulk selection). */
  ids: unknown[];
  /** Optional action-specific parameters from the caller. */
  input?: unknown;
}

export interface ActionResult {
  affected: number;
  message?: string;
  data?: unknown;
}

/**
 * Statically declares what an action touches. This is the capability grant: it
 * is serializable and enforced before the handler runs, so the same action can
 * later be lifted into a sandboxed isolate without changing its API.
 */
export interface ActionManifest {
  name: string;
  collection: string;
  operations: CollectionOperation[];
}

export interface ActionConfig {
  name: string;
  label?: string;
  /** Collection slug this action applies to. */
  collection: string;
  /** Operations the action needs; checked against the collection manifest. */
  operations: CollectionOperation[];
  /** Pure handler — no ambient access beyond the provided context. */
  handler: (context: ActionContext) => Promise<ActionResult>;
}

export interface ActionDefinition {
  name: string;
  label: string;
  collection: string;
  operations: CollectionOperation[];
  manifest: ActionManifest;
  handler: (context: ActionContext) => Promise<ActionResult>;
}
