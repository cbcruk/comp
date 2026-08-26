import {
  CapabilityError,
  defineAction,
  defineCollection,
  type ActionContext,
  type ActionExecutor,
  type ActionResult,
  type SqliteDb,
} from '@comp/core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { createAdminRouter } from './create-admin-router.js'

/**
 * `runAction` has always taken an executor, and neither transport ever passed
 * one — no config field existed to pass. The seam the docs advertised for
 * running an action somewhere else was unreachable from an app, which is a
 * thing only a test that actually supplies one would notice.
 *
 * What matters about it is where the capability boundary sits: the context an
 * executor receives is already narrowed, so an executor that ships the call
 * elsewhere inherits the limits instead of reimplementing them.
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

const collection = defineCollection({ model: posts, listDisplay: ['title'] })

const publish = defineAction({
  name: 'publish',
  collection: 'posts',
  label: 'Publish',
  // Reads and updates, and nothing else — the boundary this action gets.
  operations: ['list', 'read', 'update'],
  handler: (): Promise<ActionResult> =>
    Promise.resolve({ ok: true, message: 'published' }),
})

function app(executor?: ActionExecutor): ReturnType<typeof createAdminRouter> {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    `CREATE TABLE posts (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       title text NOT NULL,
       status text DEFAULT 'draft' NOT NULL
     )`,
  )
  sqlite.prepare(`INSERT INTO posts (title) VALUES (?)`).run('One' as never)

  const db = drizzle(async (sql, params, method) => {
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

  return createAdminRouter({
    collections: [collection],
    actions: [publish],
    getDb: () => db,
    ...(executor ? { executor } : {}),
  })
}

async function run(
  executor?: ActionExecutor,
): Promise<{ status: number; body: ActionResult }> {
  const response = await app(executor).request(
    '/collections/posts/actions/publish',
    {
      method: 'POST',
      body: JSON.stringify({ ids: [1] }),
      headers: { 'content-type': 'application/json' },
    },
  )
  return {
    status: response.status,
    body: (await response.json()) as ActionResult,
  }
}

describe('a supplied action executor', () => {
  it('runs the action in this isolate when none is given', async () => {
    const { status, body } = await run()
    expect(status).toBe(200)
    expect(body.message).toBe('published')
  })

  it('is used instead, and can answer without calling the handler', async () => {
    let asked: string | null = null
    const elsewhere: ActionExecutor = (action) => {
      asked = action.name
      return Promise.resolve({ ok: true, message: 'ran elsewhere' })
    }

    const { body } = await run(elsewhere)
    expect(asked).toBe('publish')
    expect(body.message).toBe('ran elsewhere')
  })

  it('receives the ids the request asked for', async () => {
    let seen: unknown[] = []
    const { body } = await run((action, context: ActionContext) => {
      seen = [...context.ids]
      return action.handler(context)
    })
    expect(seen).toEqual([1])
    expect(body.ok).toBe(true)
  })

  /**
   * The narrowing happens before the executor is called, not inside the
   * handler — so an executor that hands the context to a sandbox is handing
   * over something already limited, rather than being trusted to limit it.
   */
  it('is handed a db already narrowed to the declared operations', async () => {
    let refused: unknown
    await run((_action, context: ActionContext) => {
      try {
        // `publish` never declared `delete`.
        ;(context.db as unknown as { delete: () => void }).delete()
      } catch (error) {
        refused = error
      }
      return Promise.resolve({ ok: true })
    })

    expect(refused).toBeInstanceOf(CapabilityError)
    expect((refused as CapabilityError).method).toBe('delete')
  })

  it('lets the operations it did declare through', async () => {
    let threw: unknown
    await run((_action, context: ActionContext) => {
      try {
        context.db.select()
      } catch (error) {
        threw = error
      }
      return Promise.resolve({ ok: true })
    })
    expect(threw).toBeUndefined()
  })

  it('surfaces an executor failure as a shaped error, not a bare 500', async () => {
    const { status, body } = await run(() =>
      Promise.reject(new Error('the sandbox is on fire')),
    )
    expect(status).toBe(500)
    expect(body).toEqual({ error: 'Internal error' })
  })
})
