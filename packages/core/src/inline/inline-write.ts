import { Effect } from 'effect'
import type { CollectionOperation } from '../collection/define-collection.types.js'
import {
  NotGranted,
  unknownInline,
  ValidationError,
  type FieldIssue,
} from '../errors/comp-error.js'
import {
  buildInlineDeleteQuery,
  buildInlineListQuery,
  buildInlineUpdateQuery,
} from '../query/build-inline-query.js'
import { buildInsertQuery } from '../mutation/build-mutations.js'
import type { SqliteDb } from '../query/build-list-query.js'
import { validateInsert, validateUpdate } from '../validation/derive-schema.js'
import type {
  InlineSpec,
  InlineWrite,
  InlineWritePayload,
  InlineWriteResult,
  PreparedInlineWrite,
} from './inline.types.js'

/**
 * Which operations a write needs on the child collection. The caller checks
 * these against the manifest and the identity using the same
 * `CollectionOperation` vocabulary as everything else, before anything runs.
 */
export function inlineOperations(write: InlineWrite): CollectionOperation[] {
  const operations: CollectionOperation[] = []
  if (write.create?.length) operations.push('create')
  if (write.update?.length) operations.push('update')
  if (write.delete?.length) operations.push('delete')
  return operations
}

function prefixed(
  slug: string,
  index: number,
  issues: readonly FieldIssue[],
): FieldIssue[] {
  return issues.map((issue) => ({
    ...issue,
    path: ['inlines', slug, index, ...issue.path],
  }))
}

function assertGranted(spec: InlineSpec, write: InlineWrite): void {
  const slug = spec.collection.slug
  const granted = spec.collection.manifest.operations
  for (const operation of inlineOperations(write)) {
    if (!granted.includes(operation)) {
      throw new NotGranted({
        collection: slug,
        operation,
        reason: 'the collection does not allow it',
      })
    }
    if (operation === 'delete' && !spec.canDelete) {
      throw new NotGranted({
        collection: slug,
        operation,
        reason: 'the inline declares canDelete: false',
      })
    }
  }
}

/**
 * Validate one inline's changes against the child's derived schema.
 *
 * Takes no parent id, and that is the point. The parent key is the write's to
 * set, never the caller's — an inline edits a parent's own rows, so
 * re-parenting is not an operation it offers, which is why an update already
 * has that key stripped. Leaving it out of the child's schema too means a
 * nested payload can be checked *before* the parent row exists; checking it
 * afterwards is what used to leave a parent behind when a child row was bad.
 *
 * Issue paths are prefixed `inlines.<slug>.<index>` so a form can put each
 * message on the row and field it came from.
 */
export function prepareInlineWrite(
  spec: InlineSpec,
  write: InlineWrite,
): PreparedInlineWrite {
  assertGranted(spec, write)
  const child = spec.collection
  const slug = child.slug
  const issues: FieldIssue[] = []

  const create: Record<string, unknown>[] = []
  ;(write.create ?? []).forEach((values, index) => {
    try {
      create.push(validateInsert(child, values, { omit: [spec.field] }))
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error
      issues.push(...prefixed(slug, index, error.issues))
    }
  })

  const update: { id: unknown; values: Record<string, unknown> }[] = []
  ;(write.update ?? []).forEach((row, index) => {
    const { [spec.field]: _ignored, ...values } = row.values
    try {
      const validated = validateUpdate(child, values)
      // An update that only tried to move the row to another parent has
      // nothing left to set; drop it rather than emit an empty UPDATE.
      if (Object.keys(validated).length > 0) {
        update.push({ id: row.id, values: validated })
      }
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error
      issues.push(...prefixed(slug, index, error.issues))
    }
  })

  if (issues.length > 0) throw new ValidationError({ issues })

  return { collection: slug, create, update, delete: write.delete ?? [] }
}

/**
 * Check a whole nested payload — every inline, every row — without writing
 * anything.
 *
 * Callers run this before the parent is written, so a payload that cannot
 * succeed is refused while there is still nothing to clean up. D1 has no
 * interactive transaction to roll one back with, and a batch cannot help here
 * either: the child rows need the id the parent's INSERT generates, and a
 * batch prepares all of its statements up front.
 */
export function prepareInlines(
  specs: InlineSpec[],
  payload: InlineWritePayload,
): Effect.Effect<PreparedInlineWrite[], ValidationError | NotGranted> {
  const bySlug = new Map(specs.map((spec) => [spec.collection.slug, spec]))
  return Effect.gen(function* () {
    const prepared: PreparedInlineWrite[] = []
    for (const [slug, write] of Object.entries(payload)) {
      const spec = bySlug.get(slug)
      if (!spec) return yield* unknownInline(slug)
      prepared.push(
        yield* Effect.try({
          try: () => prepareInlineWrite(spec, write),
          catch: (error) => error as ValidationError | NotGranted,
        }),
      )
    }
    return prepared
  })
}

/**
 * Apply a parent's inline changes.
 *
 * Order is deliberate: deletes, then updates, then creates — so a row removed
 * and a row added in the same submit cannot collide on a unique column. Every
 * update and delete is scoped to the parent in SQL (see
 * `buildInlineUpdateQuery`), so an id belonging to another parent matches
 * nothing instead of being edited.
 *
 * Application is sequential on the given handle. D1 has no interactive
 * transactions, so this is *not* atomic there today; this function is the one
 * seam where a driver-level batch or transaction drops in, and no caller has to
 * change when it does.
 */
export function writeInlines(
  db: SqliteDb,
  specs: InlineSpec[],
  parentRow: Record<string, unknown>,
  writes: readonly PreparedInlineWrite[],
): Effect.Effect<InlineWriteResult[], ValidationError | NotGranted> {
  const bySlug = new Map(specs.map((spec) => [spec.collection.slug, spec]))

  return Effect.gen(function* () {
    const results: InlineWriteResult[] = []

    for (const prepared of writes) {
      const slug = prepared.collection
      const spec = bySlug.get(slug)
      if (!spec) return yield* unknownInline(slug)

      const parentId = parentRow[spec.targetField]

      const deleted: Record<string, unknown>[] = []
      for (const id of prepared.delete) {
        const rows = yield* Effect.promise(() =>
          buildInlineDeleteQuery(db, spec, parentId, id),
        )
        if (rows[0]) deleted.push(rows[0] as Record<string, unknown>)
      }

      const updated: Record<string, unknown>[] = []
      for (const row of prepared.update) {
        const rows = yield* Effect.promise(() =>
          buildInlineUpdateQuery(db, spec, parentId, row.id, row.values),
        )
        if (rows[0]) updated.push(rows[0] as Record<string, unknown>)
      }

      const created: Record<string, unknown>[] = []
      for (const values of prepared.create) {
        // The parent key is attached here, not validated from the payload —
        // it is only knowable once the parent row exists.
        const rows = yield* Effect.promise(() =>
          buildInsertQuery(db, spec.collection, {
            ...values,
            [spec.field]: parentId,
          }),
        )
        if (rows[0]) created.push(rows[0] as Record<string, unknown>)
      }

      results.push({ collection: slug, created, updated, deleted })
    }

    return results
  })
}

/** Read every inline's rows for one parent record. */
export async function readInlines(
  db: SqliteDb,
  specs: InlineSpec[],
  parentRow: Record<string, unknown>,
  allowed?: (spec: InlineSpec) => boolean | Promise<boolean>,
): Promise<Record<string, Record<string, unknown>[]>> {
  const inlines: Record<string, Record<string, unknown>[]> = {}

  for (const spec of specs) {
    if (allowed && !(await allowed(spec))) continue
    const rows = await buildInlineListQuery(
      db,
      spec,
      parentRow[spec.targetField],
    ).all()
    inlines[spec.collection.slug] = rows as Record<string, unknown>[]
  }

  return inlines
}
