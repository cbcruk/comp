import { defineCollection, type SqliteDb } from '@comp/core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { createAdminRouter } from './create-admin-router.js'

/**
 * Search reaching across a join table — the one thing the many-to-many work
 * left open, because search followed a column and a many-to-many has none on
 * this table.
 *
 * Driven against a real database rather than `.toSQL()`, because the property
 * that matters is one generated SQL cannot show: a record linked to two
 * matching tags has to come back once, and the total has to agree with the
 * rows. That is what a join would break and what the nested subqueries are for.
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

const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
})

const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
})

const postTags = sqliteTable('post_tags', {
  postId: integer('post_id')
    .notNull()
    .references(() => posts.id),
  tagId: integer('tag_id')
    .notNull()
    .references(() => tags.id),
})

const postCollection = defineCollection({
  model: posts,
  listDisplay: ['title'],
  manyToMany: [{ collection: 'tags', through: postTags }],
  search: ['title', 'tags__name'],
  ordering: [{ field: 'id', direction: 'asc' }],
})

const tagCollection = defineCollection({ model: tags, listDisplay: ['name'] })

const TAGS = ['ceramics', 'glassware', 'ceramic tools']
const POSTS = ['Bowls', 'Tumblers', 'Kiln notes', 'ceramics as a title']
/** post index → tag indexes */
const LINKS: [number, number[]][] = [
  [1, [1]],
  [2, [2]],
  // Two matching tags on one record: the case a join would double.
  [3, [1, 3]],
  [4, []],
]

function app(): ReturnType<typeof createAdminRouter> {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    `CREATE TABLE tags (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL)`,
  )
  sqlite.exec(
    `CREATE TABLE posts (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, title text NOT NULL)`,
  )
  sqlite.exec(
    `CREATE TABLE post_tags (
       post_id integer NOT NULL REFERENCES posts(id),
       tag_id integer NOT NULL REFERENCES tags(id)
     )`,
  )
  for (const name of TAGS) {
    sqlite.prepare(`INSERT INTO tags (name) VALUES (?)`).run(name as never)
  }
  for (const title of POSTS) {
    sqlite.prepare(`INSERT INTO posts (title) VALUES (?)`).run(title as never)
  }
  for (const [postId, tagIds] of LINKS) {
    for (const tagId of tagIds) {
      sqlite
        .prepare(`INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)`)
        .run(postId as never, tagId as never)
    }
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
    collections: [postCollection, tagCollection],
    getDb: () => db,
  })
}

interface ListBody {
  data: { id: number; title: string }[]
  total: number
}

async function search(q: string): Promise<ListBody> {
  const response = await app().request(
    `/collections/posts?q=${encodeURIComponent(q)}`,
  )
  return (await response.json()) as ListBody
}

const titles = (body: ListBody): string[] => body.data.map((row) => row.title)

describe('searching through a join table', () => {
  it('finds a record by a tag it is linked to', async () => {
    expect(titles(await search('glassware'))).toEqual(['Tumblers'])
  })

  it('returns a record linked to two matching tags exactly once', async () => {
    const body = await search('ceramic')
    // "ceramics" and "ceramic tools" both match; Kiln notes has both.
    expect(titles(body)).toEqual(['Bowls', 'Kiln notes', 'ceramics as a title'])
    expect(new Set(body.data.map((row) => row.id)).size).toBe(body.data.length)
  })

  it('keeps the total honest, which is what a join would cost', async () => {
    const body = await search('ceramic')
    expect(body.total).toBe(body.data.length)
  })

  it('ORs the link with the plain columns for one term', async () => {
    // Matches a title directly and two records through their tags.
    expect(titles(await search('ceramic'))).toContain('ceramics as a title')
  })

  it('still ANDs terms across the link and a column', async () => {
    expect(titles(await search('ceramic Bowls'))).toEqual(['Bowls'])
    expect(titles(await search('ceramic Tumblers'))).toEqual([])
  })

  it('finds nothing for a tag nobody carries', async () => {
    const body = await search('pewter')
    expect(body.data).toEqual([])
    expect(body.total).toBe(0)
  })

  it('leaves a record with no links out rather than erroring on it', async () => {
    expect(titles(await search('glassware'))).not.toContain('Bowls')
  })
})
