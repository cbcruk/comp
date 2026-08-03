import type {
  Collection,
  CollectionOperation,
} from "../collection/define-collection.types.js";
import type { FilterValue } from "../filters/filter.types.js";

/** The authenticated principal. `subject` is the stable identifier. */
export interface Identity {
  subject: string;
  [key: string]: unknown;
}

export interface AuthorizeArgs {
  identity: Identity | null;
  collection: Collection;
  operation: CollectionOperation;
}

/**
 * Which rows exist for an identity, as conditions on the collection's own
 * columns — the same vocabulary a filter uses, so `{ authorId: 7 }` and
 * `{ status: { op: "in", values: ["draft", "review"] } }` both work.
 *
 * A scope is about visibility, not about a particular operation: a row you
 * cannot see is a row you cannot read, change, or delete. Rules that depend on
 * the operation belong in {@link AuthAdapter.authorizeRecord}, which gets the
 * row itself.
 */
export type RecordScope = Record<string, FilterValue | unknown>;

export interface ScopeArgs {
  identity: Identity | null;
  collection: Collection;
}

export interface RecordAuthorizeArgs extends AuthorizeArgs {
  /** The row the operation targets, already read and already in scope. */
  record: Record<string, unknown>;
}

/**
 * Pluggable auth. v0.1 ships a trivial allow-all, but the shape is fixed from
 * day one so passkeys/SSO can drop in later without touching call sites: resolve
 * an identity from the request, then authorize an operation on a collection.
 * Authorization is keyed on the same {@link CollectionOperation} the manifest
 * declares, so capabilities and access control speak one vocabulary.
 *
 * Django decides access at three depths, and so does this: a permission per
 * model, a queryset narrowed per user, and a permission that gets the object.
 * The last two are optional methods rather than extra arguments, so a transport
 * can see whether they exist — a per-record decision costs a read, and an
 * adapter that does not make one should not pay for it.
 */
export interface AuthAdapter {
  authenticate(request: Request): Promise<Identity | null> | Identity | null;
  authorize(args: AuthorizeArgs): Promise<boolean> | boolean;
  /**
   * Narrow which rows this identity can see at all — Django's
   * `get_queryset`. Applied in SQL on every path that touches a row, reads and
   * writes alike, so an out-of-scope record is not "forbidden", it is *not
   * found*: nothing tells the caller it exists.
   */
  scope?(args: ScopeArgs): Promise<RecordScope | null> | RecordScope | null;
  /**
   * Decide again with the row in hand — Django's `has_change_permission(request,
   * obj)`. Only consulted for operations that target one record, and only after
   * {@link authorize} has already allowed the operation on the collection.
   * Defining it makes a transport read the row before writing it.
   */
  authorizeRecord?(
    args: RecordAuthorizeArgs,
  ): Promise<boolean> | boolean;
}
