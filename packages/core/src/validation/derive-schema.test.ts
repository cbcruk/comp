import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { defineCollection } from '../collection/define-collection.js'
import { ValidationError } from '../errors/comp-error.js'
import { validateInsert, validateUpdate } from './derive-schema.js'

/**
 * These pin the behaviour the schema derivation owes callers, independent of
 * which library implements it — the coercions a transport relies on, and the
 * shape a failure arrives in. They were written when validation moved off Zod,
 * because the parts that differ quietly between validators are exactly these.
 */
const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  note: text('note'),
  attendees: integer('attendees').notNull().default(0),
  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
})

const collection = defineCollection({
  model: events,
  listDisplay: ['name', 'startsAt'],
})

const issuesOf = (
  run: () => unknown,
): { path: unknown[]; message: string }[] => {
  try {
    run()
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.issues.map((issue) => ({
        path: [...issue.path],
        message: issue.message,
      }))
    }
    throw error
  }
  throw new Error('expected a ValidationError')
}

describe('a derived schema', () => {
  const valid = { name: 'Launch', startsAt: '2030-01-01T00:00:00.000Z' }

  it('takes a date as an ISO string, a Date, or epoch millis', () => {
    const at = Date.UTC(2030, 0, 1)
    for (const startsAt of [
      '2030-01-01T00:00:00.000Z',
      new Date(at),
      at,
    ] as const) {
      const row = validateInsert(collection, { name: 'Launch', startsAt })
      expect(row.startsAt).toBeInstanceOf(Date)
      expect((row.startsAt as Date).getTime()).toBe(at)
    }
  })

  // The three date forms each have a way to produce an Invalid Date instead of
  // failing; a column would then be written with one.
  it('refuses a date that is not one, in any of those forms', () => {
    for (const startsAt of ['not-a-date', new Date('nope'), Number.NaN]) {
      expect(
        issuesOf(() => validateInsert(collection, { name: 'x', startsAt })),
      ).not.toHaveLength(0)
    }
  })

  it('requires a not-null column with no default', () => {
    const issues = issuesOf(() => validateInsert(collection, valid.startsAt))
    expect(issues).not.toHaveLength(0)
  })

  it('accepts null for a nullable column, and omission for a defaulted one', () => {
    const row = validateInsert(collection, { ...valid, note: null })
    expect(row.note).toBeNull()
    expect(row).not.toHaveProperty('attendees')
  })

  it('drops a key the table does not have', () => {
    const row = validateInsert(collection, { ...valid, sneaky: 'value' })
    expect(row).not.toHaveProperty('sneaky')
  })

  it('reports every bad field at once, not just the first', () => {
    const issues = issuesOf(() =>
      validateInsert(collection, { name: 42, startsAt: 'nope', note: 7 }),
    )
    const fields = issues.map((issue) => issue.path[0])
    expect(new Set(fields)).toEqual(new Set(['name', 'startsAt', 'note']))
  })

  it('names the field in the issue path, which is what puts it under an input', () => {
    const [issue] = issuesOf(() =>
      validateInsert(collection, { ...valid, name: 42 }),
    )
    expect(issue?.path).toEqual(['name'])
    expect(issue?.message).toBeTruthy()
  })

  it('asks nothing of an update, since it states only what moved', () => {
    expect(validateUpdate(collection, {})).toEqual({})
    expect(validateUpdate(collection, { name: 'Renamed' })).toEqual({
      name: 'Renamed',
    })
  })

  it('still type-checks the fields an update does carry', () => {
    expect(
      issuesOf(() => validateUpdate(collection, { attendees: 'many' })),
    ).not.toHaveLength(0)
  })
})
