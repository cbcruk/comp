import { defineCollection, type SqliteDb } from '@comp/core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { createAdminRouter } from './create-admin-router.js'

/**
 * A list column that reaches through a foreign key — Django grew the same `__`
 * lookups in `list_display`, because the interesting thing about a row is
 * usually not the key but what it names.
 *
 * Driven against a real database: the column is selected under an alias, and
 * whether that alias survives the driver is not something generated SQL shows.
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

const people = sqliteTable('people', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Deliberately the same column name the parent has, which is the case an
  // unaliased select collapses into one.
  name: text('name').notNull(),
  joinedAt: integer('joined_at', { mode: 'timestamp' }),
})

const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  authorId: integer('author_id').references(() => people.id),
  editorId: integer('editor_id').references(() => people.id),
})

const postCollection = defineCollection({
  model: posts,
  listDisplay: [
    'name',
    'authorId__name',
    // A second key into the same table: each needs its own alias, or one
    // join would answer for both.
    'editorId__name',
    'authorId__joinedAt',
  ],
  ordering: [{ field: 'id', direction: 'asc' }],
})

const peopleCollection = defineCollection({
  model: people,
  listDisplay: ['name'],
})

/** name, authorId, editorId */
const POSTS: [string, number | null, number | null][] = [
  ['Bowls', 1, 2],
  ['Tumblers', 2, null],
  ['Orphan', null, null],
]

function app(): ReturnType<typeof createAdminRouter> {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    `CREATE TABLE people (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL, joined_at integer)`,
  )
  sqlite.exec(
    `CREATE TABLE posts (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       name text NOT NULL,
       author_id integer REFERENCES people(id),
       editor_id integer REFERENCES people(id)
     )`,
  )
  sqlite
    .prepare(`INSERT INTO people (name, joined_at) VALUES (?, ?)`)
    .run('Ada' as never, 1700000000 as never)
  sqlite
    .prepare(`INSERT INTO people (name, joined_at) VALUES (?, ?)`)
    .run('Grace' as never, 1600000000 as never)
  for (const [name, authorId, editorId] of POSTS) {
    sqlite
      .prepare(
        `INSERT INTO posts (name, author_id, editor_id) VALUES (?, ?, ?)`,
      )
      .run(name as never, authorId as never, editorId as never)
  }

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
    collections: [postCollection, peopleCollection],
    getDb: () => db,
  })
}

interface Row {
  name: string
  authorId__name: string | null
  editorId__name: string | null
  authorId__joinedAt: string | null
}

async function list(query = ''): Promise<{ data: Row[]; total: number }> {
  const response = await app().request(`/collections/posts${query}`)
  return (await response.json()) as { data: Row[]; total: number }
}

describe('a list column that follows a foreign key', () => {
  it('puts the far value on the row under the key that asked for it', async () => {
    const { data } = await list()
    expect(data.map((row) => row.authorId__name)).toEqual([
      'Ada',
      'Grace',
      null,
    ])
  })

  // The parent and the target both have a `name`. Selected without an explicit
  // alias, a driver that keys rows by column name reports one of them twice.
  it('keeps a same-named column on the parent distinct from the far one', async () => {
    const [first] = await list().then((body) => body.data)
    expect(first?.name).toBe('Bowls')
    expect(first?.authorId__name).toBe('Ada')
  })

  it('gives each foreign key its own join, even into the same table', async () => {
    const [first, second] = await list().then((body) => body.data)
    expect(first?.authorId__name).toBe('Ada')
    expect(first?.editorId__name).toBe('Grace')
    expect(second?.editorId__name).toBeNull()
  })

  // A left join, so a record without the relation is still a record.
  it('leaves the cell empty rather than dropping a row with no relation', async () => {
    const { data } = await list()
    expect(data.map((row) => row.name)).toEqual(['Bowls', 'Tumblers', 'Orphan'])
  })

  // A foreign key is to-one, so joining cannot multiply a record — which is
  // exactly why search reaches a join table with a subquery instead.
  it('does not change the total', async () => {
    const body = await list()
    expect(body.total).toBe(3)
    expect(body.data).toHaveLength(3)
  })

  it('keeps the far column decoded by its own type', async () => {
    const [first] = await list().then((body) => body.data)
    // A raw driver value would be the epoch integer; the mapper makes it a date.
    expect(first?.authorId__joinedAt).toBe(
      new Date(1700000000 * 1000).toISOString(),
    )
  })

  it('sorts by the far value, since the column is offered as one', async () => {
    const { data } = await list('?sort=authorId__name:desc')
    // SQLite orders NULL below every value, so descending puts the row with
    // no author last.
    expect(data.map((row) => row.authorId__name)).toEqual([
      'Grace',
      'Ada',
      null,
    ])

    const ascending = await list('?sort=authorId__name:asc')
    expect(ascending.data.map((row) => row.authorId__name)).toEqual([
      null,
      'Ada',
      'Grace',
    ])
  })
})

describe('declaring one', () => {
  const declare = (listDisplay: string[]) => () =>
    defineCollection({ model: posts, listDisplay })

  it('refuses a traversal through something that is not a key', () => {
    expect(declare(['name__nope'])).toThrow(/is not a foreign key/)
  })

  it('refuses a field the far table does not have', () => {
    expect(declare(['authorId__nope'])).toThrow(/is not a column there/)
  })

  it('refuses a column that is not there at all', () => {
    expect(declare(['nope'])).toThrow(/is not a column/)
  })
})
