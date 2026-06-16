import type {
  Collection,
  CollectionOperation,
} from "../collection/define-collection.types.js";

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
 * Pluggable auth. v0.1 ships a trivial allow-all, but the shape is fixed from
 * day one so passkeys/SSO can drop in later without touching call sites: resolve
 * an identity from the request, then authorize an operation on a collection.
 * Authorization is keyed on the same {@link CollectionOperation} the manifest
 * declares, so capabilities and access control speak one vocabulary.
 */
export interface AuthAdapter {
  authenticate(request: Request): Promise<Identity | null> | Identity | null;
  authorize(args: AuthorizeArgs): Promise<boolean> | boolean;
}
