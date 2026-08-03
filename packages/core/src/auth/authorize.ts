import type {
  Collection,
  CollectionOperation,
} from "../collection/define-collection.types.js";
import type {
  AuthAdapter,
  Identity,
  RecordScope,
} from "./auth-adapter.types.js";

export interface AccessArgs {
  identity: Identity | null;
  collection: Collection;
  operation: CollectionOperation;
}

/**
 * Does this adapter decide anything per row? A transport asks before reading a
 * record it would otherwise not need: the read is the cost of the feature, and
 * an adapter that only decides per collection should not pay it.
 */
export function checksRecords(auth: AuthAdapter): boolean {
  return (
    typeof auth.authorizeRecord === "function" || typeof auth.scope === "function"
  );
}

/**
 * The rows this identity may see in this collection, or undefined for all of
 * them. Resolved once per request and passed down: it belongs in the query,
 * and a scope that is resolved twice is a scope that can disagree with itself.
 */
export async function resolveScope(
  auth: AuthAdapter,
  identity: Identity | null,
  collection: Collection,
): Promise<RecordScope | undefined> {
  if (!auth.scope) return undefined;
  const scope = await auth.scope({ identity, collection });
  return scope ?? undefined;
}

/** May this identity perform this operation on this collection at all? */
export async function authorizeOperation(
  auth: AuthAdapter,
  args: AccessArgs,
): Promise<boolean> {
  return Boolean(await auth.authorize(args));
}

/**
 * May this identity perform this operation on *this row*?
 *
 * The collection-level answer still has to be yes — a per-record hook refines
 * a grant, it never creates one. The row is expected to have been read through
 * the scope already, so this is the second of the two checks, not both.
 */
export async function authorizeRecordAccess(
  auth: AuthAdapter,
  args: AccessArgs & { record: Record<string, unknown> },
): Promise<boolean> {
  if (!(await authorizeOperation(auth, args))) return false;
  if (!auth.authorizeRecord) return true;
  return Boolean(await auth.authorizeRecord(args));
}
