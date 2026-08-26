import {
  createMemoryHistoryStore,
  defineCollection,
  type AuthAdapter,
  type Identity,
  type SqliteDb,
} from '@comp/core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAdminRouter } from './create-admin-router.js'

/**
 * Independent work in one request used to run in a queue. The site index is
 * the clearest case: it asked the adapter about every operation of every
 * collection, one answer at a time, so its cost was the app's declaration size
 * times the manifest's.
 *
 * Concurrency is asserted by watching how many calls are in flight at once,
 * not by timing anything — a clock makes a flaky test out of a property that
 * can be observed directly.
 */
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void
    prepare(sql: string): {
      run(...params: never[]): unknown
      all(...params: never[]): Record<string, unknown>[]
    }
  }
}

const table = (name: string) =>
  sqliteTable(name, {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
  })

const collections = ['alpha', 'beta', 'gamma', 'delta'].map((name) =>
  defineCollection({ model: table(name), listDisplay: ['title'] }),
)

function freshDb(): SqliteDb {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of ['alpha', 'beta', 'gamma', 'delta']) {
    sqlite.exec(
      `CREATE TABLE ${name} (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, title text NOT NULL)`,
    )
  }
  return drizzle(async (sql, params, method) => {
    const statement = sqlite.prepare(sql)
    if (method === 'run') {
      statement.run(...(params as never[]))
      return { rows: [] }
    }
    const rows = statement
      .all(...(params as never[]))
      .map((row) => Object.values(row))
    return { rows: method === 'get' ? (rows[0] ?? []) : rows }
  }) as unknown as SqliteDb
}

describe('independent permission checks in one request', () => {
  let app: ReturnType<typeof createAdminRouter>
  let inFlight: number
  let peak: number
  let asked: string[]

  /** Records how many decisions overlap, and in what order they were asked. */
  const watching: AuthAdapter = {
    authenticate: (): Identity => ({ id: 'someone' }),
    async authorize({ collection, operation }) {
      asked.push(`${collection.slug}:${operation}`)
      inFlight += 1
      peak = Math.max(peak, inFlight)
      // Yield, so an overlapping call has somewhere to run.
      await Promise.resolve()
      await Promise.resolve()
      inFlight -= 1
      return true
    },
  }

  beforeEach(() => {
    const db = freshDb()
    inFlight = 0
    peak = 0
    asked = []
    app = createAdminRouter({ collections, auth: watching, getDb: () => db })
  })

  it('asks about several at once instead of one at a time', async () => {
    await app.request('/collections')
    expect(peak).toBeGreaterThan(1)
  })

  it('asks about every operation of every collection exactly once', async () => {
    await app.request('/collections')
    // 4 collections × the 5 default operations.
    expect(asked).toHaveLength(20)
    expect(new Set(asked).size).toBe(20)
  })

  // Concurrency must not reorder an answer. The index is a list a UI renders
  // in order, and the permitted operations are read positionally.
  it('keeps the collections in the order they were declared', async () => {
    const body = (await (await app.request('/collections')).json()) as {
      slug: string
      permitted: string[]
    }[]
    expect(body.map((entry) => entry.slug)).toEqual([
      'alpha',
      'beta',
      'gamma',
      'delta',
    ])
    expect(body[0]?.permitted).toEqual([
      'list',
      'read',
      'create',
      'update',
      'delete',
    ])
  })

  it('overlaps the per-collection checks on the history index too', async () => {
    // The route bails before the fan-out when no store is configured, so this
    // one needs one.
    const withHistory = createAdminRouter({
      collections,
      auth: watching,
      history: createMemoryHistoryStore(),
      getDb: () => freshDb(),
    })
    await withHistory.request('/history')
    expect(peak).toBeGreaterThan(1)
  })

  it('still refuses what the adapter refuses', async () => {
    const app2 = createAdminRouter({
      collections,
      auth: {
        authenticate: (): Identity => ({ id: 'someone' }),
        authorize: ({ collection }) => collection.slug !== 'beta',
      },
      getDb: () => freshDb(),
    })
    const body = (await (await app2.request('/collections')).json()) as {
      slug: string
    }[]
    expect(body.map((entry) => entry.slug)).toEqual(['alpha', 'gamma', 'delta'])
  })
})
