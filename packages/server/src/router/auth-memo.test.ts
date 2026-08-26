import {
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
 * `authenticate` is called by five helpers in this router, and those helpers
 * are called many times over one request. With a real adapter each call
 * re-verifies a session signature — `crypto.subtle.verify` on every one — so a
 * single write was paying for that a dozen times over. Nothing about the
 * request changes in between, so the answer cannot differ; it was pure waste.
 *
 * The count is asserted rather than described, because "resolved once per
 * request" is the kind of property that quietly stops being true.
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

const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  status: text('status', { enum: ['draft', 'published'] })
    .notNull()
    .default('draft'),
})

const SCHEMA = `CREATE TABLE posts (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  title text NOT NULL,
  status text DEFAULT 'draft' NOT NULL
)`

const collection = defineCollection({
  model: posts,
  listDisplay: ['title', 'status'],
})

function freshDb(): SqliteDb {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(SCHEMA)
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

describe('authenticating once per request', () => {
  let app: ReturnType<typeof createAdminRouter>
  let calls: number

  /** Counts authentications, and opts into every per-record decision. */
  const counting: AuthAdapter = {
    authenticate: (): Identity => {
      calls += 1
      return { id: 'someone' }
    },
    authorize: () => true,
    scope: () => null,
    authorizeRecord: () => true,
  }

  beforeEach(() => {
    const db = freshDb()
    calls = 0
    app = createAdminRouter({
      collections: [collection],
      auth: counting,
      getDb: () => db,
    })
  })

  const json = (body: unknown): RequestInit => ({
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

  it('authenticates once for a list', async () => {
    await app.request('/collections/posts')
    expect(calls).toBe(1)
  })

  it('authenticates once for a create', async () => {
    const response = await app.request(
      '/collections/posts',
      json({ title: 'Hello' }),
    )
    expect(response.status).toBe(201)
    expect(calls).toBe(1)
  })

  it('authenticates once for an update, per-record checks included', async () => {
    const created = (await (
      await app.request('/collections/posts', json({ title: 'Hello' }))
    ).json()) as { data: { id: number } }
    calls = 0

    const response = await app.request(
      `/collections/posts/${created.data.id}`,
      {
        ...json({ title: 'Renamed' }),
        method: 'PATCH',
      },
    )
    expect(response.status).toBe(200)
    expect(calls).toBe(1)
  })

  it('authenticates once for the site index, across every collection', async () => {
    await app.request('/collections')
    expect(calls).toBe(1)
  })

  it('still authenticates again on the next request', async () => {
    await app.request('/collections/posts')
    await app.request('/collections/posts')
    expect(calls).toBe(2)
  })
})
