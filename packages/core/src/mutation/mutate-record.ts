import type { RecordScope } from "../auth/auth-adapter.types.js";
import type { Collection } from "../collection/define-collection.types.js";
import { changedFields, historyLabel } from "../history/changed-fields.js";
import type {
  HistoryAction,
  HistoryStore,
} from "../history/history.types.js";
import type { SqliteDb } from "../query/build-list-query.js";
import { buildGetByIdQuery } from "../query/build-get-query.js";
import {
  buildDeleteQuery,
  buildInsertQuery,
  buildUpdateQuery,
} from "./build-mutations.js";

export interface MutationContext {
  db: SqliteDb;
  collection: Collection;
  /** Where to log the change; omit and nothing is recorded. */
  history?: HistoryStore | undefined;
  /** Who is making the change. */
  actor?: string | null;
  /** The instant recorded on the entry; defaults to now. */
  now?: Date | undefined;
  /**
   * Which rows the caller may write. Enforced inside the UPDATE and DELETE
   * statements themselves, so a write that reaches past it matches no row and
   * returns nothing — the same answer as an id that was never there.
   *
   * It lives here, not in each route, for the reason history does: a rule a
   * transport has to remember is a rule that holds until somebody adds a
   * transport.
   */
  scope?: RecordScope | undefined;
  /**
   * The row as it was, when the caller already read it (to check per-record
   * permission, say). Passing it spares the extra read history would make.
   */
  before?: Row | undefined;
}

type Row = Record<string, unknown>;

async function log(
  context: MutationContext,
  action: HistoryAction,
  recordId: string,
  label: string,
  fields: string[],
): Promise<void> {
  if (!context.history) return;
  await context.history.record({
    collection: context.collection.slug,
    recordId,
    action,
    label,
    fields,
    actor: context.actor ?? null,
    at: context.now ?? new Date(),
  });
}

function idOf(collection: Collection, row: Row | undefined): string {
  const key = collection.primaryKey;
  const value = key ? row?.[key] : undefined;
  return value === undefined || value === null ? "" : String(value);
}

/**
 * Write a record and record what happened, in one call.
 *
 * The log lives here rather than in each transport because it is not optional
 * behavior a caller opts into per route: an HTTP write and an MCP write are the
 * same change, and a history that only knows about one of them is worse than
 * none. Putting the hook in the mutation layer is what makes "who changed this"
 * true rather than mostly true.
 */
export async function createRecord(
  context: MutationContext,
  values: Row,
): Promise<Row | undefined> {
  const rows = await buildInsertQuery(context.db, context.collection, values);
  const row = rows[0] as Row | undefined;
  if (!row) return undefined;

  const recordId = idOf(context.collection, row);
  await log(
    context,
    "create",
    recordId,
    historyLabel(context.collection, row, recordId),
    [],
  );
  return row;
}

/**
 * Update a record, recording only the fields whose value actually moved.
 *
 * When history is on this costs one extra read: the row has to be seen before
 * the write to know what changed. That read is skipped entirely when no store
 * is configured, so the cost lands only where the feature is used.
 */
export async function updateRecord(
  context: MutationContext,
  id: unknown,
  values: Row,
): Promise<Row | undefined> {
  const before =
    context.before ??
    (context.history
      ? ((
          await buildGetByIdQuery(
            context.db,
            context.collection,
            id,
            context.scope,
          ).all()
        )[0] as Row | undefined)
      : undefined);

  const rows = await buildUpdateQuery(
    context.db,
    context.collection,
    id,
    values,
    context.scope,
  );
  const row = rows[0] as Row | undefined;
  if (!row) return undefined;

  const recordId = idOf(context.collection, row);
  await log(
    context,
    "update",
    recordId,
    historyLabel(context.collection, row, recordId),
    before ? changedFields(before, row) : [],
  );
  return row;
}

/** Delete a record, keeping an entry that says what it was. */
export async function deleteRecord(
  context: MutationContext,
  id: unknown,
): Promise<Row | undefined> {
  const rows = await buildDeleteQuery(
    context.db,
    context.collection,
    id,
    context.scope,
  );
  const row = rows[0] as Row | undefined;
  if (!row) return undefined;

  const recordId = idOf(context.collection, row);
  await log(
    context,
    "delete",
    recordId,
    historyLabel(context.collection, row, recordId),
    [],
  );
  return row;
}
