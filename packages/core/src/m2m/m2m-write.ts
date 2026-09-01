import { Effect } from 'effect'
import { READ_CONCURRENCY } from '../effect/run-effect.js'
import {
  buildLinkDelete,
  buildLinkInsert,
  buildLinkedIdsQuery,
  buildLinkedRecordsQuery,
  buildTargetExistsQuery,
} from '../query/build-m2m-query.js'
import type { SqliteDb } from '../query/build-list-query.js'
import { ValidationError, type FieldIssue } from '../errors/comp-error.js'
import type {
  LinkedRecord,
  ManyToManyResult,
  ManyToManySpec,
  ManyToManyWrite,
} from './m2m.types.js'

/** Ids as a comparable set — the values arrive as text over HTTP. */
function keyOf(value: unknown): string {
  return String(value)
}

/**
 * Refuse ids that name no record. An unknown id is rejected rather than
 * dropped: a save that silently linked less than it was asked to is a save
 * that looks like it worked.
 */
function assertTargetsExist(
  db: SqliteDb,
  spec: ManyToManySpec,
  ids: readonly unknown[],
): Effect.Effect<void, ValidationError> {
  return Effect.gen(function* () {
    const rows = (yield* Effect.promise(() =>
      buildTargetExistsQuery(db, spec.target, spec.targetKey, ids).all(),
    )) as { value: unknown }[]
    const found = new Set(rows.map((row) => keyOf(row.value)))
    const missing = ids.filter((id) => !found.has(keyOf(id)))
    if (missing.length === 0) return
    const issues: FieldIssue[] = missing.map((id) => ({
      path: ['manyToMany', spec.name],
      message: `No ${spec.target.label} with ${spec.targetKey} ${String(id)}`,
    }))
    return yield* new ValidationError({ issues })
  })
}

/**
 * Check a payload's ids before a parent row is written.
 *
 * Only a create needs this: it is the one path where refusing after the write
 * leaves behind a row that should never have existed. An update's parent was
 * already there, so a refused link does not change whether it should be.
 *
 * Every id the payload names is checked, not only those that would end up
 * newly linked — the record does not exist yet, so it has nothing linked and
 * the two sets are the same.
 */
export function checkLinkTargets(
  db: SqliteDb,
  specs: ManyToManySpec[],
  payload: ManyToManyWrite,
): Effect.Effect<void, ValidationError> {
  const byName = new Map(specs.map((spec) => [spec.name, spec]))
  return Effect.gen(function* () {
    for (const [name, ids] of Object.entries(payload)) {
      const spec = byName.get(name)
      if (!spec || !Array.isArray(ids) || ids.length === 0) continue
      yield* assertTargetsExist(db, spec, ids)
    }
  })
}

/** The ids currently linked to this record. */
export async function readLinks(
  db: SqliteDb,
  spec: ManyToManySpec,
  parentId: unknown,
): Promise<unknown[]> {
  const rows = (await buildLinkedIdsQuery(db, spec, parentId).all()) as {
    value: unknown
  }[]
  return rows.map((row) => row.value)
}

/** The linked records, each with the label it is recognized by. */
export async function readLinkedRecords(
  db: SqliteDb,
  spec: ManyToManySpec,
  parentId: unknown,
): Promise<LinkedRecord[]> {
  const rows = (await buildLinkedRecordsQuery(db, spec, parentId).all()) as {
    value: unknown
    label?: unknown
  }[]
  return rows.map((row) => ({
    value: row.value,
    label:
      row.label === null || row.label === undefined ? null : String(row.label),
  }))
}

/**
 * Every relationship's links for one record, keyed by name.
 *
 * Gated per relationship the way an inline's rows are: the far side is a
 * collection in its own right, and reaching its records sideways must not
 * grant more than listing it would.
 */
export function readManyToMany(
  db: SqliteDb,
  specs: ManyToManySpec[],
  row: Record<string, unknown>,
  allow?: (spec: ManyToManySpec) => Promise<boolean> | boolean,
): Effect.Effect<Record<string, LinkedRecord[]> | undefined> {
  if (specs.length === 0) return Effect.succeed(undefined)

  // Independent per relationship, like an inline's rows; collected in
  // declaration order so concurrency cannot reorder the keys.
  return Effect.forEach(
    specs,
    (spec) =>
      Effect.gen(function* () {
        const permitted = allow
          ? yield* Effect.promise(async () => allow(spec))
          : true
        if (!permitted) return null
        const records = yield* Effect.promise(() =>
          readLinkedRecords(db, spec, row[spec.parentKey]),
        )
        return { name: spec.name, records }
      }),
    { concurrency: READ_CONCURRENCY },
  ).pipe(
    Effect.map((entries) => {
      const result: Record<string, LinkedRecord[]> = {}
      for (const entry of entries) {
        if (entry) result[entry.name] = entry.records
      }
      return result
    }),
  )
}

/**
 * Set one relationship's membership to exactly the ids given.
 *
 * Django's `.set()`: the payload is the whole set, and the difference against
 * what is stored is worked out here. A form can only report what is selected
 * now, so asking it for a changelist would mean asking it to remember a state
 * it never had.
 *
 * Unknown ids are refused rather than dropped. A link to a record that is not
 * there is not a link, and silently discarding half a selection is the kind of
 * save that looks like it worked.
 */
export function writeLinks(
  db: SqliteDb,
  spec: ManyToManySpec,
  parentId: unknown,
  desired: readonly unknown[],
): Effect.Effect<ManyToManyResult, ValidationError> {
  return Effect.gen(function* () {
    const current = yield* Effect.promise(() => readLinks(db, spec, parentId))
    const currentKeys = new Set(current.map(keyOf))

    // Deduplicated: selecting the same record twice is still one link, and the
    // join table would refuse the second row anyway.
    const wanted = new Map<string, unknown>()
    for (const id of desired) wanted.set(keyOf(id), id)

    const toLink = [...wanted.entries()]
      .filter(([key]) => !currentKeys.has(key))
      .map(([, id]) => id)
    const toUnlink = current.filter((id) => !wanted.has(keyOf(id)))

    if (toLink.length > 0) yield* assertTargetsExist(db, spec, toLink)

    // Unlink first: a set that swaps one member for another stays within any
    // uniqueness the join table declares while it is being applied.
    if (toUnlink.length > 0) {
      yield* Effect.promise(() => buildLinkDelete(db, spec, parentId, toUnlink))
    }
    if (toLink.length > 0) {
      yield* Effect.promise(() => buildLinkInsert(db, spec, parentId, toLink))
    }

    return { name: spec.name, linked: toLink, unlinked: toUnlink }
  })
}

/**
 * Apply a record's many-to-many changes.
 *
 * Only the relationships the payload names are touched: a form that does not
 * render a relationship must not be able to clear it by omission.
 */
export function writeManyToMany(
  db: SqliteDb,
  specs: ManyToManySpec[],
  row: Record<string, unknown>,
  payload: ManyToManyWrite,
): Effect.Effect<ManyToManyResult[], ValidationError> {
  const byName = new Map(specs.map((spec) => [spec.name, spec]))

  return Effect.gen(function* () {
    const results: ManyToManyResult[] = []
    for (const [name, ids] of Object.entries(payload)) {
      const spec = byName.get(name)
      if (!spec || !Array.isArray(ids)) continue
      results.push(yield* writeLinks(db, spec, row[spec.parentKey], ids))
    }
    return results
  })
}

/** Which relationships a payload asks to change, for permission checks. */
export function manyToManyNames(payload: ManyToManyWrite): string[] {
  return Object.keys(payload).filter((name) => Array.isArray(payload[name]))
}
