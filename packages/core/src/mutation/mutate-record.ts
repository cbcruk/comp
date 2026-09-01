import { Effect } from 'effect'
import type { RecordScope } from '../auth/auth-adapter.types.js'
import type { Collection } from '../collection/define-collection.types.js'
import { changedFields, historyLabel } from '../history/changed-fields.js'
import type { FileStore } from '../files/file.types.js'
import type { HistoryAction, HistoryStore } from '../history/history.types.js'
import type { SqliteDb } from '../query/build-list-query.js'
import { buildGetByIdQuery } from '../query/build-get-query.js'
import {
  buildDeleteQuery,
  buildInsertQuery,
  buildUpdateQuery,
} from './build-mutations.js'

export interface MutationContext {
  db: SqliteDb
  collection: Collection
  /** Where to log the change; omit and nothing is recorded. */
  history?: HistoryStore | undefined
  /**
   * Where this collection's files live. Omit it and nothing is ever removed —
   * the same opt-in history is, and for the same reason: knowing what a write
   * replaced costs a read.
   */
  files?: FileStore | undefined
  /** Who is making the change. */
  actor?: string | null
  /** The instant recorded on the entry; defaults to now. */
  now?: Date | undefined
  /**
   * Which rows the caller may write. Enforced inside the UPDATE and DELETE
   * statements themselves, so a write that reaches past it matches no row and
   * returns nothing — the same answer as an id that was never there.
   *
   * It lives here, not in each route, for the reason history does: a rule a
   * transport has to remember is a rule that holds until somebody adds a
   * transport.
   */
  scope?: RecordScope | undefined
  /**
   * The row as it was, when the caller already read it (to check per-record
   * permission, say). Passing it spares the extra read history would make.
   */
  before?: Row | undefined
}

type Row = Record<string, unknown>

function log(
  context: MutationContext,
  action: HistoryAction,
  recordId: string,
  label: string,
  fields: string[],
): Effect.Effect<void> {
  const store = context.history
  if (!store) return Effect.void
  return Effect.promise(() =>
    store.record({
      collection: context.collection.slug,
      recordId,
      action,
      label,
      fields,
      actor: context.actor ?? null,
      at: context.now ?? new Date(),
    }),
  )
}

/**
 * Forget the files a write left nothing pointing at.
 *
 * Called **after** the row is written, never before, and its failures are
 * swallowed: a file the store could not delete is an orphan, while a file
 * deleted before a write that then fails is a record pointing at nothing. Of
 * the two only one loses something.
 *
 * Django stopped deleting on its own in 1.3, because a rollback could leave the
 * row without its file. Comp can go the other way for a narrow reason: the key
 * is the store's to invent, so two records cannot arrive at the same one, and
 * the delete happens after the write has already committed. A store that would
 * rather keep everything makes `remove` a no-op — the decision is its own.
 */
function sweep(
  context: MutationContext,
  keys: readonly unknown[],
): Effect.Effect<void> {
  const store = context.files
  if (!store) return Effect.void
  const removable = keys.filter(
    (key): key is string => typeof key === 'string' && key !== '',
  )
  if (removable.length === 0) return Effect.void
  return Effect.promise(async () => {
    await Promise.all(
      removable.map((key) => store.remove(key).catch(() => undefined)),
    )
  })
}

/** The keys an update left behind — the old value of every field it changed. */
function replacedKeys(
  collection: Collection,
  before: Row | undefined,
  after: Row,
): unknown[] {
  if (!before) return []
  return collection.files.flatMap((file) => {
    const was = before[file.field]
    return was === after[file.field] ? [] : [was]
  })
}

/** The keys a row holds for each declared file field. */
function fileKeys(collection: Collection, row: Row | undefined): unknown[] {
  if (!row) return []
  return collection.files.map((file) => row[file.field])
}

function idOf(collection: Collection, row: Row | undefined): string {
  const key = collection.primaryKey
  const value = key ? row?.[key] : undefined
  return value === undefined || value === null ? '' : String(value)
}

/**
 * Write a record and record what happened, in one call.
 *
 * The log lives here rather than in each transport because it is not optional
 * behavior a caller opts into per route: an HTTP write and an MCP write are the
 * same change, and a history that only knows about one of them is worse than
 * none. Putting the hook in the mutation layer is what makes "who changed this"
 * true rather than mostly true.
 *
 * The error channel is empty on purpose. A driver failure is a defect, not a
 * refusal a caller can act on, and its message can name the schema — so it
 * stays something the transport reports opaquely rather than something every
 * call site is asked to handle.
 */
export function createRecord(
  context: MutationContext,
  values: Row,
): Effect.Effect<Row | undefined> {
  return Effect.gen(function* () {
    const rows = yield* Effect.promise(() =>
      buildInsertQuery(context.db, context.collection, values),
    )
    const row = rows[0] as Row | undefined
    if (!row) return undefined

    const recordId = idOf(context.collection, row)
    yield* log(
      context,
      'create',
      recordId,
      historyLabel(context.collection, row, recordId),
      [],
    )
    // The row is gone, so nothing points at its files any more.
    yield* sweep(context, fileKeys(context.collection, row))
    return row
  })
}

/**
 * Update a record, recording only the fields whose value actually moved.
 *
 * When history is on this costs one extra read: the row has to be seen before
 * the write to know what changed. That read is skipped entirely when no store
 * is configured, so the cost lands only where the feature is used.
 */
export function updateRecord(
  context: MutationContext,
  id: unknown,
  values: Row,
): Effect.Effect<Row | undefined> {
  return Effect.gen(function* () {
    // The read is needed by history, and now also by a file field: without the
    // old row there is no way to know which key the write replaced.
    const sweeping =
      Boolean(context.files) && context.collection.files.length > 0
    const before =
      context.before ??
      (context.history || sweeping
        ? ((yield* Effect.promise(() =>
            buildGetByIdQuery(
              context.db,
              context.collection,
              id,
              context.scope,
            ).all(),
          ))[0] as Row | undefined)
        : undefined)

    const rows = yield* Effect.promise(() =>
      buildUpdateQuery(
        context.db,
        context.collection,
        id,
        values,
        context.scope,
      ),
    )
    const row = rows[0] as Row | undefined
    if (!row) return undefined

    const recordId = idOf(context.collection, row)
    yield* log(
      context,
      'update',
      recordId,
      historyLabel(context.collection, row, recordId),
      before ? changedFields(before, row) : [],
    )
    // Only the keys the write actually moved away from; a field left untouched
    // still points at its file.
    yield* sweep(context, replacedKeys(context.collection, before, row))
    return row
  })
}

/** Delete a record, keeping an entry that says what it was. */
export function deleteRecord(
  context: MutationContext,
  id: unknown,
): Effect.Effect<Row | undefined> {
  return Effect.gen(function* () {
    const rows = yield* Effect.promise(() =>
      buildDeleteQuery(context.db, context.collection, id, context.scope),
    )
    const row = rows[0] as Row | undefined
    if (!row) return undefined

    const recordId = idOf(context.collection, row)
    yield* log(
      context,
      'delete',
      recordId,
      historyLabel(context.collection, row, recordId),
      [],
    )
    // The row is gone, so nothing points at its files any more.
    yield* sweep(context, fileKeys(context.collection, row))
    return row
  })
}
